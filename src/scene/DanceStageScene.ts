import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  VRMLoaderPlugin,
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  VRMUtils,
  type VRM,
  type VRMSpringBoneColliderGroup,
  type VRMHumanBoneName,
} from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';
import type { AudioMetrics } from '../audio/beatDetector';
import {
  computeDancePose,
  computeIdlePose,
  DANCE_BONE_NAMES,
  DANCE_STYLES,
  PoseBlender,
  type ConcreteDanceStyle,
  type DanceStyle,
} from '../dance/choreography';
import {
  buildClipForVrm,
  loadCustomMotionFile,
  loadPresetVRMAnimation,
  OPEN_SOURCE_MOTIONS,
  type MotionPlaybackMode,
} from '../dance/motionLibrary';
import {
  DEFAULT_CHARACTER_ID,
  getCharacterById,
} from './characterLibrary';
import {
  getStageThemeById,
  summarizeSpectrumForSpotlight,
  type StageThemeId,
} from './themes';

export type CameraPresetId = 'full' | 'closeup' | 'orbit' | 'low';

export interface StageHudSnapshot {
  modelLoaded: boolean;
  activeCharacterId: string;
  modelName: string;
  loadProgress: number;
  loadError: string | null;
  activeStyle: ConcreteDanceStyle;
  activeMotifLabel: string;
  motionMode: MotionPlaybackMode;
  activeMotionId: string;
  activeMotionLabel: string;
  motionLoading: boolean;
  motionError: string | null;
}

export interface StageCallbacks {
  initialCharacterId?: string;
  onHudUpdate: (snapshot: StageHudSnapshot) => void;
  sampleAudio: (dt: number) => AudioMetrics;
}

interface CameraPresetTarget {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetTarget> = {
  full: {
    position: new THREE.Vector3(0, 1.36, 4.18),
    target: new THREE.Vector3(0, 0.56, 0),
  },
  closeup: {
    position: new THREE.Vector3(0.28, 1.44, 1.65),
    target: new THREE.Vector3(0, 1.24, 0),
  },
  orbit: {
    position: new THREE.Vector3(2.55, 1.62, 2.55),
    target: new THREE.Vector3(0, 0.78, 0),
  },
  low: {
    position: new THREE.Vector3(-0.75, 0.56, 2.85),
    target: new THREE.Vector3(0, 0.94, 0),
  },
};

// Reusable math scratch objects (zero per-frame allocations)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _targetAccentColor = new THREE.Color();
const _targetSecondaryColor = new THREE.Color();
const _targetHighlightColor = new THREE.Color();
const _targetRimColor = new THREE.Color();
const _targetBgColor = new THREE.Color();
const _targetDustColor = new THREE.Color();
const _spotPos = new THREE.Vector3();
const _spotTargetPos = new THREE.Vector3();
const _mocapHipsPos = new THREE.Vector3();
const _footWorldPos = new THREE.Vector3();
const _restBox = new THREE.Box3();
const STAGE_SURFACE_Y = 0.014;
const _mocapBoneQuats = new Map<string, THREE.Quaternion>();
for (const boneName of DANCE_BONE_NAMES) {
  _mocapBoneQuats.set(boneName, new THREE.Quaternion());
}

interface SpotlightFixture {
  light: THREE.SpotLight;
  beamMesh: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
  poolMesh: THREE.Mesh;
  poolMat: THREE.MeshBasicMaterial;
}

export class DanceStageScene {
  private readonly container: HTMLElement;
  private readonly callbacks: StageCallbacks;
  private readonly isSoftwareGl: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly pmremEnv: THREE.Texture;

  // Lighting & reactive stage elements
  private readonly rimLight: THREE.DirectionalLight;
  private readonly stageSpotLight: THREE.PointLight;
  private readonly spotlightRig: {
    center: SpotlightFixture;
    left: SpotlightFixture;
    right: SpotlightFixture;
  };
  private readonly neonRingMat: THREE.MeshStandardMaterial;
  private readonly eqInstancedMesh: THREE.InstancedMesh;
  private readonly eqBladeCount = 24;
  private readonly dustPoints: THREE.Points;
  private readonly dustMat: THREE.PointsMaterial;
  private readonly stageTextures: THREE.Texture[] = [];
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];

  // VRM & animation state
  private vrm: VRM | null = null;
  private restHipsY = 0.94;
  private footSoleOffset = 0.085;
  private toeSoleOffset = 0.024;
  private currentCharacterId = DEFAULT_CHARACTER_ID;
  private currentModelName = getCharacterById(DEFAULT_CHARACTER_ID).shortLabel;
  private currentBlobUrl: string | null = null;
  private modelRequestSeq = 0;
  private modelAbortController: AbortController | null = null;
  private contextLost = false;
  private readonly poseBlender = new PoseBlender();

  // Mocap AnimationMixer state
  private mixer: THREE.AnimationMixer | null = null;
  private activeMocapAction: THREE.AnimationAction | null = null;
  private previousMocapAction: THREE.AnimationAction | null = null;
  private currentVrmAnimation: VRMAnimation | null = null;
  private currentMotionId = OPEN_SOURCE_MOTIONS[0].id;
  private currentMotionLabel = OPEN_SOURCE_MOTIONS[0].label;
  private currentMotionNativeBpm = OPEN_SOURCE_MOTIONS[0].nativeBpm;
  private currentMotionAccentHex = OPEN_SOURCE_MOTIONS[0].accentHex;
  private motionLoading = false;
  private motionError: string | null = null;
  private motionRequestSeq = 0;
  private mocapBlendWeight = 0;
  private smoothedMixerSpeed = 1;

  // Playback / reactive state synced from React refs
  private motionMode: MotionPlaybackMode = 'procedural';
  private danceStyle: DanceStyle = 'auto';
  private intensity = 1.0;
  private isPlaying = false;
  private autoExpression = true;
  private themeId: StageThemeId = 'auto';
  private spotlightEnabled = true;
  private spotlightIntensity = 1.0;
  private activeCameraPreset: CameraPresetId = 'full';
  private transitionCameraActive = false;
  private orbitAutoAngle = 0;

  // Blink scheduler
  private blinkTimer = 2.4;
  private blinkDuration = 0;

  // Loop & lifecycle
  private frameId = 0;
  private lastTimestamp = 0;
  private elapsedSec = 0;
  private hudThrottleAccum = 0;
  private lastReportedStyle: ConcreteDanceStyle = 'hiphop';
  private lastReportedMotif = 'Down-Bounce 律动';
  private disposed = false;

  constructor(container: HTMLElement, callbacks: StageCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const bgHex = 0x0b0d13;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.065);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremEnv = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.pmremEnv;
    pmremGenerator.dispose();

    const initialAspect = width / height;
    const initialFov = initialAspect < 1 ? Math.min(58, 36 / Math.pow(initialAspect, 0.42)) : 36;
    this.camera = new THREE.PerspectiveCamera(initialFov, initialAspect, 0.1, 60);
    this.camera.position.copy(CAMERA_PRESETS.full.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(CAMERA_PRESETS.full.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 7.2;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minPolarAngle = 0.2;
    this.controls.addEventListener('start', () => {
      this.transitionCameraActive = false;
    });

    // 3-point warm/cool studio lighting (calibrated so pale VRM skin & white fabric retain crisp shading)
    const hemiLight = new THREE.HemisphereLight(0x9bc2ff, 0x161925, 0.44);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e4, 1.08);
    keyLight.position.set(2.8, 4.4, 3.6);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -2.8;
    keyLight.shadow.camera.right = 2.8;
    keyLight.shadow.camera.top = 3.2;
    keyLight.shadow.camera.bottom = -1.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    this.rimLight = new THREE.DirectionalLight(0x5eead4, 0.85);
    this.rimLight.position.set(-2.4, 2.8, -3.2);
    this.scene.add(this.rimLight);

    this.stageSpotLight = new THREE.PointLight(0xf59e0b, 0.85, 8.5, 2.0);
    this.stageSpotLight.position.set(0, 2.6, -1.9);
    this.scene.add(this.stageSpotLight);

    // Build grounded composite stage architecture + dynamic 3-spotlight rig
    const { neonRingMat, eqMesh, dustPoints, dustMat } = this.buildStageArchitecture();
    this.neonRingMat = neonRingMat;
    this.eqInstancedMesh = eqMesh;
    this.dustPoints = dustPoints;
    this.dustMat = dustMat;
    this.spotlightRig = this.buildSpotlightRig();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.lastTimestamp = performance.now();
    this.tick(this.lastTimestamp);
    const startChar = getCharacterById(callbacks.initialCharacterId ?? DEFAULT_CHARACTER_ID);
    void this.selectCharacter(startChar.id);
  }

  public setConfig(config: {
    motionMode: MotionPlaybackMode;
    danceStyle: DanceStyle;
    intensity: number;
    isPlaying: boolean;
    autoExpression: boolean;
    themeId: StageThemeId;
    spotlightEnabled: boolean;
    spotlightIntensity: number;
  }): void {
    this.motionMode = config.motionMode;
    this.danceStyle = config.danceStyle;
    this.intensity = config.intensity;
    this.isPlaying = config.isPlaying;
    this.autoExpression = config.autoExpression;
    this.themeId = config.themeId;
    this.spotlightEnabled = config.spotlightEnabled;
    this.spotlightIntensity = config.spotlightIntensity;
  }

  public async selectOpenSourceMotion(motionId: string): Promise<void> {
    const preset = OPEN_SOURCE_MOTIONS.find((m) => m.id === motionId);
    if (!preset) return;

    const seq = ++this.motionRequestSeq;
    this.currentMotionId = preset.id;
    this.currentMotionLabel = preset.label;
    this.currentMotionNativeBpm = preset.nativeBpm;
    this.currentMotionAccentHex = preset.accentHex;
    this.motionLoading = true;
    this.motionError = null;
    this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);

    try {
      const vrmAnim = await loadPresetVRMAnimation(preset);
      if (this.disposed || seq !== this.motionRequestSeq) return;
      this.currentVrmAnimation = vrmAnim;
      this.motionLoading = false;
      this.applyCurrentVrmAnimationToMixer(preset.id);
      this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);
    } catch (err) {
      if (this.disposed || seq !== this.motionRequestSeq) return;
      this.motionLoading = false;
      this.motionError =
        err instanceof Error ? err.message : '开源舞蹈动作加载失败';
      this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);
    }
  }

  public async loadCustomMotion(file: File): Promise<void> {
    const seq = ++this.motionRequestSeq;
    this.motionLoading = true;
    this.motionError = null;
    this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);

    try {
      const loaded = await loadCustomMotionFile(file);
      if (this.disposed || seq !== this.motionRequestSeq) return;
      this.currentMotionId = 'custom';
      this.currentMotionLabel = loaded.name;
      this.currentMotionNativeBpm = loaded.nativeBpm;
      this.currentMotionAccentHex = '#22d3ee';
      this.currentVrmAnimation = loaded.vrmAnimation;
      this.motionLoading = false;
      this.applyCurrentVrmAnimationToMixer(`custom:${loaded.name}`);
      this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);
    } catch (err) {
      if (this.disposed || seq !== this.motionRequestSeq) return;
      this.motionLoading = false;
      this.motionError =
        err instanceof Error ? err.message : '动作文件解析失败（支持 .bvh / .vrma）';
      this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);
    }
  }

  public setCameraPreset(preset: CameraPresetId): void {
    this.activeCameraPreset = preset;
    this.transitionCameraActive = true;
    if (preset === 'orbit') {
      this.orbitAutoAngle = Math.atan2(
        this.camera.position.x,
        this.camera.position.z,
      );
    }
  }

  public async loadDefaultModel(): Promise<void> {
    await this.selectCharacter(DEFAULT_CHARACTER_ID);
  }

  public async selectCharacter(characterId: string): Promise<void> {
    const preset = getCharacterById(characterId);
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    this.currentCharacterId = preset.id;
    await this.loadVrmFromUrl(preset.url, preset.shortLabel);
  }

  public async loadCustomVrmFile(file: File): Promise<void> {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    const url = URL.createObjectURL(file);
    this.currentBlobUrl = url;
    this.currentCharacterId = 'custom';
    await this.loadVrmFromUrl(url, file.name);
  }

  public dispose(): void {
    this.disposed = true;
    this.modelAbortController?.abort();
    this.modelAbortController = null;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    this.clearCurrentVrm();
    for (const tex of this.stageTextures) tex.dispose();
    for (const geo of this.disposableGeometries) geo.dispose();
    for (const mat of this.disposableMaterials) mat.dispose();
    this.pmremEnv.dispose();
    this.controls.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private emitHudSnapshot(
    modelLoaded: boolean,
    loadProgress: number,
    loadError: string | null,
  ): void {
    this.callbacks.onHudUpdate({
      modelLoaded,
      activeCharacterId: this.currentCharacterId,
      modelName: this.currentModelName,
      loadProgress,
      loadError,
      activeStyle: this.lastReportedStyle,
      activeMotifLabel: this.lastReportedMotif,
      motionMode: this.motionMode,
      activeMotionId: this.currentMotionId,
      activeMotionLabel: this.currentMotionLabel,
      motionLoading: this.motionLoading,
      motionError: this.motionError,
    });
  }

  private disposeMixer(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    this.activeMocapAction = null;
    this.previousMocapAction = null;
  }

  private applyCurrentVrmAnimationToMixer(clipName: string): void {
    if (!this.vrm || !this.currentVrmAnimation) return;
    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    }

    const clip = buildClipForVrm(this.currentVrmAnimation, this.vrm, clipName);
    const nextAction = this.mixer.clipAction(clip);
    nextAction.reset();
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (this.activeMocapAction && this.activeMocapAction !== nextAction) {
      if (this.previousMocapAction && this.previousMocapAction !== this.activeMocapAction) {
        this.previousMocapAction.stop();
        this.mixer.uncacheAction(this.previousMocapAction.getClip());
      }
      this.previousMocapAction = this.activeMocapAction;
      this.previousMocapAction.crossFadeTo(nextAction, 0.35, false);
    }
    this.activeMocapAction = nextAction;
  }

  private clearCurrentVrm(): void {
    this.disposeMixer();
    const existing = this.vrm;
    this.vrm = null;
    if (existing) {
      this.scene.remove(existing.scene);
      try {
        VRMUtils.deepDispose(existing.scene);
      } catch {
        // Ignore disposal quirks on custom VRM materials
      }
      this.renderer.renderLists.dispose();
    }
  }

  private async fetchArrayBufferWithProgress(
    url: string,
    signal: AbortSignal,
    onProgress: (pct: number) => void,
  ): Promise<ArrayBuffer> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`模型下载失败 (HTTP ${response.status})`);
    }
    const contentLengthHeader = response.headers.get('content-length');
    const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;
    if (!response.body || !Number.isFinite(totalBytes) || totalBytes <= 0) {
      return await response.arrayBuffer();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.byteLength;
        onProgress(Math.min(92, Math.round((receivedBytes / totalBytes) * 92)));
      }
    }

    const combined = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined.buffer;
  }

  private async loadVrmFromUrl(url: string, displayName: string): Promise<void> {
    const reqSeq = ++this.modelRequestSeq;
    this.modelAbortController?.abort();
    const abortController = new AbortController();
    this.modelAbortController = abortController;

    this.currentModelName = displayName;
    // Free previous VRM GPU textures & geometries BEFORE loading/parsing the next model
    // so peak WebGL memory never doubles during character switching.
    this.clearCurrentVrm();
    this.emitHudSnapshot(false, 0, null);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    try {
      const buffer = await this.fetchArrayBufferWithProgress(
        url,
        abortController.signal,
        (pct) => {
          if (this.disposed || reqSeq !== this.modelRequestSeq) return;
          this.emitHudSnapshot(false, pct, null);
        },
      );

      if (this.disposed || reqSeq !== this.modelRequestSeq) return;
      this.emitHudSnapshot(false, 95, null);

      const gltf = await loader.parseAsync(buffer, '');
      const vrm = (gltf.userData as { vrm?: VRM }).vrm;

      if (this.disposed || reqSeq !== this.modelRequestSeq) {
        if (vrm) {
          try {
            VRMUtils.deepDispose(vrm.scene);
          } catch {
            // Ignore disposal quirks
          }
        }
        return;
      }

      if (!vrm) {
        throw new Error('文件中未找到有效的 VRM 人形骨骼数据');
      }

      VRMUtils.rotateVRM0(vrm);

      vrm.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = !this.isSoftwareGl;
          obj.receiveShadow = !this.isSoftwareGl;
          obj.frustumCulled = false;
        }
      });

      this.scene.add(vrm.scene);
      this.vrm = vrm;
      this.mixer = new THREE.AnimationMixer(vrm.scene);

      // Cache rest hips height & measure exact shoe/foot sole offsets before posing
      const hipsNode = vrm.humanoid?.getNormalizedBoneNode('hips');
      this.restHipsY = hipsNode ? hipsNode.position.y : 0.94;
      if (this.restHipsY < 0.3) this.restHipsY = 0.94;
      this.calibrateFootClearance(vrm);
      this.enhanceSpringBoneColliders(vrm);

      // Apply immediate relaxed pose so first painted frame is never T-pose or clipped
      const initialPose = computeIdlePose(0);
      this.applyPoseToVrm(initialPose, 0.016);
      this.enforceFloorContact(vrm);
      vrm.update(0.016);

      // Re-bind already loaded mocap clip onto the new VRM model
      if (this.currentVrmAnimation) {
        this.applyCurrentVrmAnimationToMixer(this.currentMotionId);
      }

      if (!this.contextLost) {
        this.renderer.render(this.scene, this.camera);
      }
      this.emitHudSnapshot(true, 100, null);
    } catch (err) {
      if (abortController.signal.aborted || this.disposed || reqSeq !== this.modelRequestSeq) {
        return;
      }
      this.clearCurrentVrm();
      const message =
        err instanceof Error ? err.message : 'VRM 模型加载失败，请重试';
      this.emitHudSnapshot(false, 0, message);
    }
  }

  private buildStageArchitecture(): {
    neonRingMat: THREE.MeshStandardMaterial;
    eqMesh: THREE.InstancedMesh;
    dustPoints: THREE.Points;
    dustMat: THREE.PointsMaterial;
  } {
    const stageGroup = new THREE.Group();

    // 1. Wide architectural dark studio floor (infinite-feel grounded horizon)
    const floorTex = createStudioFloorTexture(this.renderer.capabilities.getMaxAnisotropy());
    this.stageTextures.push(floorTex);

    const floorGeo = new THREE.CircleGeometry(18, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTex,
      roughness: 0.72,
      metalness: 0.18,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.05;
    floorMesh.receiveShadow = !this.isSoftwareGl;
    stageGroup.add(floorMesh);
    this.disposableGeometries.push(floorGeo);
    this.disposableMaterials.push(floorMat);

    // 2. Stepped circular dance podium (primary silhouette + metallic trim)
    const podiumBaseGeo = new THREE.CylinderGeometry(1.75, 1.92, 0.05, 64);
    const podiumBaseMat = new THREE.MeshStandardMaterial({
      color: 0x171b26,
      roughness: 0.38,
      metalness: 0.72,
    });
    const podiumBase = new THREE.Mesh(podiumBaseGeo, podiumBaseMat);
    podiumBase.position.y = -0.025;
    podiumBase.receiveShadow = !this.isSoftwareGl;
    stageGroup.add(podiumBase);

    const topDeckGeo = new THREE.CylinderGeometry(1.56, 1.62, 0.02, 64);
    const topDeckMat = new THREE.MeshStandardMaterial({
      color: 0x11141c,
      roughness: 0.56,
      metalness: 0.25,
    });
    const topDeck = new THREE.Mesh(topDeckGeo, topDeckMat);
    topDeck.position.y = 0.001;
    topDeck.receiveShadow = !this.isSoftwareGl;
    stageGroup.add(topDeck);

    // Recessed emissive rhythm trim ring
    const ringGeo = new THREE.TorusGeometry(1.64, 0.016, 16, 96);
    const neonRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.15,
      roughness: 0.2,
      metalness: 0.4,
    });
    const ringMesh = new THREE.Mesh(ringGeo, neonRingMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.008;
    stageGroup.add(ringMesh);

    // Contact shadow grounding disc right beneath dancer's feet
    const contactTex = createContactShadowTexture();
    this.stageTextures.push(contactTex);
    const contactGeo = new THREE.PlaneGeometry(1.35, 1.35);
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const contactDisc = new THREE.Mesh(contactGeo, contactMat);
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.015;
    stageGroup.add(contactDisc);

    this.disposableGeometries.push(podiumBaseGeo, topDeckGeo, ringGeo, contactGeo);
    this.disposableMaterials.push(podiumBaseMat, topDeckMat, neonRingMat, contactMat);

    // 3. Semicircular 24-band InstancedMesh light equalizer blades behind dancer
    const bladeGeo = new THREE.BoxGeometry(0.085, 1.0, 0.045);
    bladeGeo.translate(0, 0.5, 0); // Bottom-pivot so scaling Y grows cleanly upward!
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.6,
    });
    const eqMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, this.eqBladeCount);
    eqMesh.frustumCulled = false;

    const arcRadius = 2.65;
    for (let i = 0; i < this.eqBladeCount; i++) {
      const t = i / (this.eqBladeCount - 1);
      const angle = THREE.MathUtils.lerp(-Math.PI * 0.42, Math.PI * 0.42, t);
      const x = Math.sin(angle) * arcRadius;
      const z = -Math.cos(angle) * arcRadius;
      _vec3A.set(x, -0.04, z);
      _quat.setFromAxisAngle(_vec3B.set(0, 1, 0), -angle);
      _scale.set(1, 0.24, 1);
      _mat4.compose(_vec3A, _quat, _scale);
      eqMesh.setMatrixAt(i, _mat4);
      eqMesh.setColorAt(i, _color.setHSL(0.08 + t * 0.45, 0.75, 0.55));
    }
    eqMesh.instanceMatrix.needsUpdate = true;
    if (eqMesh.instanceColor) eqMesh.instanceColor.needsUpdate = true;
    stageGroup.add(eqMesh);

    // Pylon base arc rail anchoring the EQ blades
    const railGeo = new THREE.TorusGeometry(arcRadius, 0.032, 12, 64, Math.PI * 0.88);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x1e2433,
      roughness: 0.35,
      metalness: 0.8,
    });
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.rotation.x = Math.PI / 2;
    railMesh.rotation.z = Math.PI * 0.06;
    railMesh.position.y = -0.04;
    stageGroup.add(railMesh);

    this.disposableGeometries.push(bladeGeo, railGeo);
    this.disposableMaterials.push(bladeMat, railMat);

    // 4. Subtle atmospheric stage motes
    const dustCount = 90;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 1.1 + Math.random() * 4.2;
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = 0.1 + Math.random() * 2.9;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustSprite = createParticleSpriteTexture();
    this.stageTextures.push(dustSprite);
    const dustMat = new THREE.PointsMaterial({
      color: 0xfde68a,
      map: dustSprite,
      size: 0.055,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    stageGroup.add(dustPoints);
    this.disposableGeometries.push(dustGeo);
    this.disposableMaterials.push(dustMat);

    this.scene.add(stageGroup);
    return { neonRingMat, eqMesh, dustPoints, dustMat };
  }

  private buildSpotlightRig(): {
    center: SpotlightFixture;
    left: SpotlightFixture;
    right: SpotlightFixture;
  } {
    const beamTex = createVolumetricBeamTexture();
    const poolTex = createSpotlightPoolTexture();
    this.stageTextures.push(beamTex, poolTex);

    // Apex at (0,0,0), wide end at z = +1.0 so Object3D.lookAt(target) aims the beam naturally
    const beamGeo = new THREE.CylinderGeometry(0.035, 1.0, 1.0, 28, 1, true);
    beamGeo.translate(0, -0.5, 0);
    beamGeo.rotateX(-Math.PI / 2);

    const poolGeo = new THREE.PlaneGeometry(2.0, 2.0);
    poolGeo.rotateX(-Math.PI / 2);

    this.disposableGeometries.push(beamGeo, poolGeo);

    const createFixture = (
      initialPos: [number, number, number],
      colorHex: number,
      intensity: number,
      angle: number,
    ): SpotlightFixture => {
      const light = new THREE.SpotLight(colorHex, intensity, 14, angle, 0.65, 2.0);
      light.position.set(initialPos[0], initialPos[1], initialPos[2]);
      light.castShadow = false;
      this.scene.add(light);
      this.scene.add(light.target);

      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        map: beamTex,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.copy(light.position);
      beamMesh.frustumCulled = false;
      this.scene.add(beamMesh);

      const poolMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        map: poolTex,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const poolMesh = new THREE.Mesh(poolGeo, poolMat);
      poolMesh.position.set(0, 0.018, 0);
      this.scene.add(poolMesh);

      this.disposableMaterials.push(beamMat, poolMat);

      return { light, beamMesh, beamMat, poolMesh, poolMat };
    };

    return {
      center: createFixture([0, 4.45, -0.75], 0xf59e0b, 3.2, 0.3),
      left: createFixture([-2.4, 4.05, -0.55], 0x38bdf8, 2.4, 0.26),
      right: createFixture([2.4, 4.05, -0.55], 0xf472b6, 2.4, 0.26),
    };
  }

  private tick = (now: number): void => {
    if (this.disposed || this.contextLost) return;

    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = THREE.MathUtils.clamp(Number.isFinite(rawDt) ? rawDt : 0.016, 0.001, 0.15);
    this.elapsedSec += dt;

    try {
      const metrics = this.callbacks.sampleAudio(dt);

      // 1. Update VRM character choreography or music-synced mocap AnimationMixer
      const targetPose = this.isPlaying
        ? computeDancePose(this.danceStyle, metrics, this.intensity)
        : computeIdlePose(this.elapsedSec);

      const blendedPose = this.poseBlender.step(targetPose, dt);

      const wantsMocap =
        this.isPlaying &&
        this.motionMode === 'mocap' &&
        this.mixer !== null &&
        this.activeMocapAction !== null;

      const blendRate = 1 - Math.exp(-8.5 * dt);
      this.mocapBlendWeight = THREE.MathUtils.lerp(
        this.mocapBlendWeight,
        wantsMocap ? 1 : 0,
        blendRate,
      );

      if (this.vrm) {
        if (this.mocapBlendWeight > 0.005 && this.mixer && this.activeMocapAction) {
          // Real-time tempo sync: scale mocap playback speed smoothly with music BPM & beat groove
          const bpmRatio = metrics.bpm / Math.max(60, this.currentMotionNativeBpm);
          const energyBoost = 0.93 + metrics.overall * 0.14 + metrics.beatPulse * 0.12;
          const intensityScale = 0.78 + 0.22 * this.intensity;
          const targetSpeed = THREE.MathUtils.clamp(
            bpmRatio * energyBoost * intensityScale,
            0.55,
            1.55,
          );
          this.smoothedMixerSpeed = THREE.MathUtils.lerp(
            this.smoothedMixerSpeed,
            targetSpeed,
            1 - Math.exp(-8 * dt),
          );

          this.mixer.timeScale = this.smoothedMixerSpeed;
          this.mixer.update(dt);

          if (this.mocapBlendWeight < 0.992) {
            this.blendMocapWithProceduralPose(blendedPose, this.mocapBlendWeight);
          }
          // Keep music-reactive facial expressions & eye blinking alive during mocap
          this.applyExpressionsToVrm(blendedPose.expression, dt);
        } else {
          this.applyPoseToVrm(blendedPose, dt);
        }

        this.enforceFloorContact(this.vrm);
        this.vrm.update(dt);
      }

      // 2. Update stage equalizer blades & reactive lighting
      this.updateStageReactivity(metrics, blendedPose.activeStyle, dt);

      // 3. Smoothly interpolate camera presets or gentle orbit
      this.updateCamera(dt);
      this.controls.update();

      // 4. Throttle HUD active-style notifications (never 60Hz React state updates)
      this.hudThrottleAccum += dt;
      if (
        (blendedPose.activeStyle !== this.lastReportedStyle ||
          blendedPose.activeMotifLabel !== this.lastReportedMotif) &&
        this.hudThrottleAccum > 0.2
      ) {
        this.lastReportedStyle = blendedPose.activeStyle;
        this.lastReportedMotif = blendedPose.activeMotifLabel;
        this.hudThrottleAccum = 0;
        this.emitHudSnapshot(this.vrm !== null, this.vrm ? 100 : 0, null);
      }

      this.renderer.render(this.scene, this.camera);
    } catch {
      // Keep the animation loop alive if a single frame encounters a transient issue
    }

    if (this.disposed || this.contextLost) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick(performance.now()));
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private blendMocapWithProceduralPose(
    pose: ReturnType<PoseBlender['step']>,
    mocapWeight: number,
  ): void {
    const vrm = this.vrm;
    const humanoid = vrm?.humanoid;
    if (!vrm || !humanoid) return;

    const isVrm0 = vrm.meta?.metaVersion === '0';
    const xzSign = isVrm0 ? -1 : 1;

    const hipsNode = humanoid.getNormalizedBoneNode('hips');
    if (hipsNode) {
      _mocapHipsPos.copy(hipsNode.position);
      _vec3A.set(
        pose.hipsOffset.x * xzSign,
        this.restHipsY + pose.hipsOffset.y,
        pose.hipsOffset.z * xzSign,
      );
      hipsNode.position.lerpVectors(_vec3A, _mocapHipsPos, mocapWeight);
    }

    for (const boneName of DANCE_BONE_NAMES) {
      const node = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
      if (!node) continue;
      const savedQuat = _mocapBoneQuats.get(boneName)!;
      savedQuat.copy(node.quaternion);
      const [rx, ry, rz] = pose.bones[boneName];
      _euler.set(rx, ry, rz, 'XYZ');
      node.quaternion.setFromEuler(_euler);
      if (isVrm0) {
        node.quaternion.x = -node.quaternion.x;
        node.quaternion.z = -node.quaternion.z;
      }
      node.quaternion.slerp(savedQuat, mocapWeight);
    }
  }

  private applyPoseToVrm(
    pose: ReturnType<PoseBlender['step']>,
    dt: number,
  ): void {
    const vrm = this.vrm;
    if (!vrm?.humanoid) return;

    const isVrm0 = vrm.meta?.metaVersion === '0';
    const xzSign = isVrm0 ? -1 : 1;

    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) {
      hips.position.set(
        pose.hipsOffset.x * xzSign,
        this.restHipsY + pose.hipsOffset.y,
        pose.hipsOffset.z * xzSign,
      );
    }

    for (const boneName of DANCE_BONE_NAMES) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
      if (node) {
        const [rx, ry, rz] = pose.bones[boneName];
        _euler.set(rx, ry, rz, 'XYZ');
        node.quaternion.setFromEuler(_euler);
        if (isVrm0) {
          node.quaternion.x = -node.quaternion.x;
          node.quaternion.z = -node.quaternion.z;
        }
      }
    }

    this.applyExpressionsToVrm(pose.expression, dt);
  }

  private calibrateFootClearance(vrm: VRM): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    vrm.scene.updateMatrixWorld(true);
    _restBox.setFromObject(vrm.scene);
    const restMinY = Number.isFinite(_restBox.min.y) ? _restBox.min.y : 0;

    const leftFoot = humanoid.getRawBoneNode('leftFoot');
    const rightFoot = humanoid.getRawBoneNode('rightFoot');
    let footWorldY = Infinity;
    if (leftFoot) {
      leftFoot.getWorldPosition(_footWorldPos);
      footWorldY = Math.min(footWorldY, _footWorldPos.y);
    }
    if (rightFoot) {
      rightFoot.getWorldPosition(_footWorldPos);
      footWorldY = Math.min(footWorldY, _footWorldPos.y);
    }
    this.footSoleOffset = Number.isFinite(footWorldY)
      ? THREE.MathUtils.clamp(footWorldY - restMinY, 0.055, 0.14)
      : 0.085;

    const leftToes = humanoid.getRawBoneNode('leftToes');
    const rightToes = humanoid.getRawBoneNode('rightToes');
    let toesWorldY = Infinity;
    if (leftToes) {
      leftToes.getWorldPosition(_footWorldPos);
      toesWorldY = Math.min(toesWorldY, _footWorldPos.y);
    }
    if (rightToes) {
      rightToes.getWorldPosition(_footWorldPos);
      toesWorldY = Math.min(toesWorldY, _footWorldPos.y);
    }
    this.toeSoleOffset = Number.isFinite(toesWorldY)
      ? THREE.MathUtils.clamp(toesWorldY - restMinY, 0.018, 0.065)
      : 0.024;
  }

  private enforceFloorContact(vrm: VRM): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const hips = humanoid.getNormalizedBoneNode('hips');
    if (!hips) return;

    humanoid.update();
    vrm.scene.updateMatrixWorld(true);

    let lowestSoleY = Infinity;
    const leftFoot = humanoid.getRawBoneNode('leftFoot');
    const rightFoot = humanoid.getRawBoneNode('rightFoot');
    const leftToes = humanoid.getRawBoneNode('leftToes');
    const rightToes = humanoid.getRawBoneNode('rightToes');

    if (leftFoot) {
      leftFoot.getWorldPosition(_footWorldPos);
      lowestSoleY = Math.min(lowestSoleY, _footWorldPos.y - this.footSoleOffset);
    }
    if (rightFoot) {
      rightFoot.getWorldPosition(_footWorldPos);
      lowestSoleY = Math.min(lowestSoleY, _footWorldPos.y - this.footSoleOffset);
    }
    if (leftToes) {
      leftToes.getWorldPosition(_footWorldPos);
      lowestSoleY = Math.min(lowestSoleY, _footWorldPos.y - this.toeSoleOffset);
    }
    if (rightToes) {
      rightToes.getWorldPosition(_footWorldPos);
      lowestSoleY = Math.min(lowestSoleY, _footWorldPos.y - this.toeSoleOffset);
    }

    if (Number.isFinite(lowestSoleY) && lowestSoleY < STAGE_SURFACE_Y) {
      hips.position.y += STAGE_SURFACE_Y - lowestSoleY;
    }
  }

  private enhanceSpringBoneColliders(vrm: VRM): void {
    const manager = vrm.springBoneManager;
    const humanoid = vrm.humanoid;
    if (!manager || !humanoid) return;

    const zSign = vrm.meta?.metaVersion === '0' ? -1 : 1;
    const torsoColliders: VRMSpringBoneCollider[] = [];
    const chestRaw = humanoid.getRawBoneNode('chest');
    if (chestRaw) {
      const chestFrontCollider = new VRMSpringBoneCollider(
        new VRMSpringBoneColliderShapeSphere({
          radius: 0.125,
          offset: new THREE.Vector3(0, 0.028, 0.02 * zSign),
        }),
      );
      chestRaw.add(chestFrontCollider);
      torsoColliders.push(chestFrontCollider);
    }

    const upperChestRaw = humanoid.getRawBoneNode('upperChest');
    if (upperChestRaw) {
      const upperChestFrontCollider = new VRMSpringBoneCollider(
        new VRMSpringBoneColliderShapeCapsule({
          radius: 0.088,
          offset: new THREE.Vector3(0.072, 0.045, 0.044 * zSign),
          tail: new THREE.Vector3(-0.072, 0.045, 0.044 * zSign),
        }),
      );
      upperChestRaw.add(upperChestFrontCollider);
      torsoColliders.push(upperChestFrontCollider);
    }

    const neckRaw = humanoid.getRawBoneNode('neck');
    if (neckRaw) {
      const neckShield = new VRMSpringBoneCollider(
        new VRMSpringBoneColliderShapeSphere({
          radius: 0.064,
          offset: new THREE.Vector3(0, 0.024, 0.01 * zSign),
        }),
      );
      neckRaw.add(neckShield);
      torsoColliders.push(neckShield);
    }

    const torsoShieldGroup: VRMSpringBoneColliderGroup | null =
      torsoColliders.length > 0
        ? { name: 'TorsoHairShield', colliders: torsoColliders }
        : null;

    const existingGroups = manager.colliderGroups;
    const leftArmGroup = existingGroups.find((g) => /leftupperarm/i.test(g.name ?? ''));
    const rightArmGroup = existingGroups.find((g) => /rightupperarm/i.test(g.name ?? ''));

    const modifiedJoints: Array<typeof manager.joints extends Set<infer J> ? J : never> = [];
    for (const joint of manager.joints) {
      const boneName = joint.bone.name;
      let changed = false;

      if (/hair/i.test(boneName)) {
        if (torsoShieldGroup && !joint.colliderGroups.includes(torsoShieldGroup)) {
          joint.colliderGroups.push(torsoShieldGroup);
          changed = true;
        }
        if (joint.settings.hitRadius > 0 && joint.settings.hitRadius < 0.022) {
          joint.settings.hitRadius = 0.022;
        }
      } else if (/topsupperarm|sleeve/i.test(boneName) && joint.colliderGroups.length === 0) {
        const armGroup = /_L_|left/i.test(boneName)
          ? leftArmGroup
          : /_R_|right/i.test(boneName)
            ? rightArmGroup
            : null;
        if (armGroup) {
          joint.colliderGroups.push(armGroup);
          changed = true;
        }
      }

      if (changed) {
        modifiedJoints.push(joint);
      }
    }

    if (modifiedJoints.length > 0) {
      for (const joint of modifiedJoints) {
        manager.deleteJoint(joint);
        manager.addJoint(joint);
      }
      vrm.scene.updateMatrixWorld(true);
      manager.setInitState();
    }
  }

  private applyExpressionsToVrm(
    expression: ReturnType<PoseBlender['step']>['expression'],
    dt: number,
  ): void {
    const expr = this.vrm?.expressionManager;
    if (!expr) return;

    this.blinkTimer -= dt;
    let blinkWeight = 0;
    if (this.blinkTimer <= 0) {
      this.blinkDuration += dt;
      if (this.blinkDuration < 0.14) {
        blinkWeight = Math.sin((this.blinkDuration / 0.14) * Math.PI);
      } else {
        this.blinkDuration = 0;
        this.blinkTimer = 2.6 + Math.random() * 2.4;
      }
    }

    expr.setValue('blink', blinkWeight);
    if (this.autoExpression) {
      expr.setValue('happy', expression.happy);
      expr.setValue('aa', expression.aa);
      expr.setValue('relaxed', expression.relaxed);
      expr.setValue('surprised', expression.surprised);
    } else {
      expr.setValue('happy', 0);
      expr.setValue('aa', 0);
      expr.setValue('relaxed', 0.15);
      expr.setValue('surprised', 0);
    }
  }

  private updateStageReactivity(
    metrics: AudioMetrics,
    activeStyle: ConcreteDanceStyle,
    dt: number,
  ): void {
    const theme = getStageThemeById(this.themeId);
    const spectral = summarizeSpectrumForSpotlight(metrics.spectrumBands);

    if (this.themeId === 'auto') {
      if (this.motionMode === 'mocap') {
        _targetAccentColor.set(this.currentMotionAccentHex);
      } else {
        const styleMeta = DANCE_STYLES.find((s) => s.id === activeStyle);
        _targetAccentColor.set(styleMeta?.accentHex ?? theme.primaryHex);
      }
      _targetSecondaryColor.set(theme.secondaryHex);
      _targetHighlightColor.set(theme.highlightHex);
      _targetRimColor.copy(_targetAccentColor);
      _targetBgColor.set(theme.backgroundHex);
      _targetDustColor.set(theme.dustHex);
    } else {
      _targetAccentColor.set(theme.primaryHex);
      _targetSecondaryColor.set(theme.secondaryHex);
      _targetHighlightColor.set(theme.highlightHex);
      _targetRimColor.set(theme.rimHex);
      _targetBgColor.set(theme.backgroundHex);
      _targetDustColor.set(theme.dustHex);
    }

    const colorAlpha = 1 - Math.exp(-5 * dt);
    this.neonRingMat.color.lerp(_targetAccentColor, colorAlpha);
    this.neonRingMat.emissive.copy(this.neonRingMat.color);
    this.neonRingMat.emissiveIntensity =
      0.65 + metrics.beatPulse * 1.15 + metrics.bass * 0.65;

    this.stageSpotLight.color.copy(this.neonRingMat.color);
    this.stageSpotLight.intensity = 0.65 + metrics.beatPulse * 0.85 + metrics.mid * 0.4;

    this.rimLight.color.lerp(_targetRimColor, 1 - Math.exp(-3.5 * dt));
    this.rimLight.intensity = 0.72 + metrics.treble * 0.58;

    // Smoothly transition studio background, exponential fog, and dust motes to chosen theme
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(_targetBgColor, colorAlpha);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(_targetBgColor, colorAlpha);
    }
    this.dustMat.color.lerp(_targetDustColor, colorAlpha);

    // Update 3-fixture spectrum-driven stage spotlights
    this.updateSpotlights(metrics, spectral, dt);

    const arcRadius = 2.65;
    for (let i = 0; i < this.eqBladeCount; i++) {
      const t = i / (this.eqBladeCount - 1);
      const angle = THREE.MathUtils.lerp(-Math.PI * 0.42, Math.PI * 0.42, t);
      const x = Math.sin(angle) * arcRadius;
      const z = -Math.cos(angle) * arcRadius;

      const bandVal = metrics.spectrumBands[i] ?? 0;
      const idleWave = 0.2 + 0.08 * Math.sin(this.elapsedSec * 2.2 + i * 0.45);
      const heightScale = this.isPlaying
        ? 0.24 + bandVal * (2.25 + metrics.beatPulse * 0.55)
        : idleWave;

      _vec3A.set(x, -0.04, z);
      _quat.setFromAxisAngle(_vec3B.set(0, 1, 0), -angle);
      _scale.set(1, heightScale, 1);
      _mat4.compose(_vec3A, _quat, _scale);
      this.eqInstancedMesh.setMatrixAt(i, _mat4);
      _color.copy(this.neonRingMat.color).lerp(_targetSecondaryColor, t * 0.8);
      this.eqInstancedMesh.setColorAt(i, _color);
    }
    this.eqInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.eqInstancedMesh.instanceColor) this.eqInstancedMesh.instanceColor.needsUpdate = true;

    // Gentle upward float on atmospheric dust
    const posAttr = this.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const speed = 0.08 + metrics.overall * 0.35;
    for (let i = 0; i < posAttr.count; i++) {
      let y = posAttr.getY(i) + speed * dt;
      if (y > 3.1) y = 0.1;
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;
    this.dustPoints.rotation.y += dt * (0.04 + metrics.mid * 0.08);
  }

  private updateSpotlights(
    metrics: AudioMetrics,
    spectral: ReturnType<typeof summarizeSpectrumForSpotlight>,
    dt: number,
  ): void {
    const enabled = this.spotlightEnabled;
    const gain = this.spotlightIntensity;
    const rigs = [
      this.spotlightRig.center,
      this.spotlightRig.left,
      this.spotlightRig.right,
    ];

    if (!enabled) {
      for (const f of rigs) {
        f.light.intensity = 0;
        f.beamMesh.visible = false;
        f.poolMesh.visible = false;
      }
      return;
    }

    // Track live dancer hips X/Z for the primary follow-spot
    let dancerX = 0;
    let dancerZ = 0;
    const hipsNode = this.vrm?.humanoid?.getNormalizedBoneNode('hips');
    if (hipsNode) {
      hipsNode.getWorldPosition(_vec3A);
      dancerX = THREE.MathUtils.clamp(_vec3A.x, -0.85, 0.85);
      dancerZ = THREE.MathUtils.clamp(_vec3A.z, -0.85, 0.85);
    }

    const activeBoost = this.isPlaying ? 1.0 : 0.35;
    const colorLerp = 1 - Math.exp(-7 * dt);
    const t = this.elapsedSec;

    // 1. Center follow spotlight: color blends Primary -> Highlight by spectralTilt, angle breathes with bass
    const center = this.spotlightRig.center;
    center.beamMesh.visible = true;
    center.poolMesh.visible = true;

    _color
      .copy(_targetAccentColor)
      .lerp(_targetHighlightColor, spectral.spectralTilt * 0.68 + metrics.beatPulse * 0.22);
    center.light.color.lerp(_color, colorLerp);
    center.beamMat.color.copy(center.light.color);
    center.poolMat.color.copy(center.light.color);

    const centerAngle =
      0.25 + (spectral.lowEnergy * 0.13 + metrics.beatPulse * 0.09) * activeBoost;
    center.light.angle = centerAngle;
    center.light.intensity =
      (2.4 + (spectral.lowEnergy * 2.8 + metrics.beatPulse * 3.2) * activeBoost) * gain;

    _spotPos.set(
      Math.sin(t * (0.45 + spectral.midEnergy * 0.35)) * 0.65,
      4.45,
      -0.75 + Math.cos(t * 0.35) * 0.28,
    );
    _spotTargetPos.set(dancerX, 0.0, dancerZ + 0.12);
    this.syncFixtureGeometry(
      center,
      _spotPos,
      _spotTargetPos,
      centerAngle,
      (0.095 + (spectral.lowEnergy * 0.13 + metrics.beatPulse * 0.11) * activeBoost) *
        Math.min(1.4, gain),
      (0.26 + (spectral.lowEnergy * 0.26 + metrics.beatPulse * 0.28) * activeBoost) *
        Math.min(1.4, gain),
    );

    // 2. Left bass-reactive sweeping spotlight (rear-left concert truss)
    const left = this.spotlightRig.left;
    left.beamMesh.visible = true;
    left.poolMesh.visible = true;
    _color.copy(_targetAccentColor).lerp(_targetSecondaryColor, 0.25 + spectral.midEnergy * 0.25);
    left.light.color.lerp(_color, colorLerp);
    left.beamMat.color.copy(left.light.color);
    left.poolMat.color.copy(left.light.color);

    const leftAngle = 0.2 + spectral.lowEnergy * 0.14 * activeBoost;
    left.light.angle = leftAngle;
    left.light.intensity =
      (1.8 + (spectral.lowEnergy * 3.2 + metrics.beatPulse * 2.2) * activeBoost) * gain;

    const leftSweep = Math.sin(t * 0.95 + spectral.lowEnergy * 0.8);
    _spotPos.set(-2.35, 4.05, -0.55);
    _spotTargetPos.set(
      dancerX * 0.45 - 0.38 + leftSweep * 0.48,
      0.0,
      dancerZ * 0.45 + 0.18 + Math.cos(t * 0.8) * 0.38,
    );
    this.syncFixtureGeometry(
      left,
      _spotPos,
      _spotTargetPos,
      leftAngle,
      (0.07 + (spectral.lowEnergy * 0.14 + metrics.beatPulse * 0.09) * activeBoost) *
        Math.min(1.4, gain),
      (0.18 + (spectral.lowEnergy * 0.3 + metrics.beatPulse * 0.22) * activeBoost) *
        Math.min(1.4, gain),
    );

    // 3. Right treble/mid-reactive sweeping spotlight (rear-right concert truss)
    const right = this.spotlightRig.right;
    right.beamMesh.visible = true;
    right.poolMesh.visible = true;
    _color
      .copy(_targetSecondaryColor)
      .lerp(_targetHighlightColor, spectral.highEnergy * 0.65);
    right.light.color.lerp(_color, colorLerp);
    right.beamMat.color.copy(right.light.color);
    right.poolMat.color.copy(right.light.color);

    const rightAngle =
      0.2 + (spectral.midEnergy * 0.08 + spectral.highEnergy * 0.11) * activeBoost;
    right.light.angle = rightAngle;
    right.light.intensity =
      (1.8 + (spectral.highEnergy * 3.0 + spectral.midEnergy * 2.0) * activeBoost) * gain;

    const rightSweep = Math.cos(t * 1.1 + spectral.highEnergy * 0.9);
    _spotPos.set(2.35, 4.05, -0.55);
    _spotTargetPos.set(
      dancerX * 0.45 + 0.38 + rightSweep * 0.48,
      0.0,
      dancerZ * 0.45 + 0.18 - Math.sin(t * 0.85) * 0.38,
    );
    this.syncFixtureGeometry(
      right,
      _spotPos,
      _spotTargetPos,
      rightAngle,
      (0.07 + (spectral.highEnergy * 0.14 + spectral.midEnergy * 0.08) * activeBoost) *
        Math.min(1.4, gain),
      (0.18 + (spectral.highEnergy * 0.3 + spectral.midEnergy * 0.2) * activeBoost) *
        Math.min(1.4, gain),
    );
  }

  private syncFixtureGeometry(
    fixture: SpotlightFixture,
    origin: THREE.Vector3,
    floorTarget: THREE.Vector3,
    angleRad: number,
    beamOpacity: number,
    poolOpacity: number,
  ): void {
    fixture.light.position.copy(origin);
    fixture.light.target.position.set(floorTarget.x, 0.72, floorTarget.z);
    fixture.light.target.updateMatrixWorld();

    fixture.beamMesh.position.copy(origin);
    fixture.beamMesh.lookAt(floorTarget);

    const beamLength = origin.distanceTo(floorTarget);
    const beamRadius = Math.tan(angleRad) * beamLength * 0.72;
    fixture.beamMesh.scale.set(beamRadius, beamRadius, beamLength);
    fixture.beamMat.opacity = THREE.MathUtils.clamp(beamOpacity, 0, 0.32);

    fixture.poolMesh.position.set(floorTarget.x, 0.018, floorTarget.z);
    const poolScale = Math.max(0.55, beamRadius * 0.85);
    fixture.poolMesh.scale.set(poolScale, 1, poolScale);
    fixture.poolMat.opacity = THREE.MathUtils.clamp(poolOpacity, 0, 0.55);
  }

  private updateCamera(dt: number): void {
    if (this.activeCameraPreset === 'orbit' && !this.transitionCameraActive) {
      // Gentle cinematic stage orbit while dancing
      this.orbitAutoAngle += dt * (this.isPlaying ? 0.34 : 0.14);
      const radius = 3.25;
      const desiredX = Math.sin(this.orbitAutoAngle) * radius;
      const desiredZ = Math.cos(this.orbitAutoAngle) * radius;
      const lambda = 1 - Math.exp(-4 * dt);
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, desiredX, lambda);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, desiredZ, lambda);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 1.52, lambda);
      return;
    }

    if (!this.transitionCameraActive) return;

    const preset = CAMERA_PRESETS[this.activeCameraPreset];
    const alpha = 1 - Math.exp(-6.5 * dt);
    this.camera.position.lerp(preset.position, alpha);
    this.controls.target.lerp(preset.target, alpha);

    if (
      this.camera.position.distanceToSquared(preset.position) < 0.0004 &&
      this.controls.target.distanceToSquared(preset.target) < 0.0004
    ) {
      this.transitionCameraActive = false;
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 240);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? Math.min(58, 36 / Math.pow(aspect, 0.42)) : 36;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.emitHudSnapshot(false, 0, 'WebGL 图形上下文中断，正在等待恢复或请点击恢复默认人物');
  };

  private handleContextRestored = (): void => {
    if (this.disposed) return;
    this.contextLost = false;
    this.lastTimestamp = performance.now();
    this.tick(this.lastTimestamp);
    const fallbackId =
      this.currentCharacterId === 'custom'
        ? DEFAULT_CHARACTER_ID
        : this.currentCharacterId;
    void this.selectCharacter(fallbackId);
  };
}

function detectSoftwareWebGL(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createStudioFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    20,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, '#1e2433');
  grad.addColorStop(0.45, '#131722');
  grad.addColorStop(1, '#0b0d13');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle concentric architectural stage rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let r = 64; r <= 240; r += 44) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle crosshairs
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    6,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createParticleSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    2,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createVolumetricBeamTexture(): THREE.CanvasTexture {
  const width = 64;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const vertGrad = ctx.createLinearGradient(0, 0, 0, height);
  vertGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  vertGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.42)');
  vertGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.12)');
  vertGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = vertGrad;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSpotlightPoolTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    2,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

