import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || '舞台渲染发生意外错误',
    };
  }

  public componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error captured in state for user-facing recovery UI
  }

  private handleResetAndReload = (): void => {
    try {
      window.localStorage.removeItem('vrm_stage_character_id');
      window.localStorage.removeItem('vrm_stage_theme_id');
    } catch {
      // Ignore storage access errors
    }
    window.location.assign(window.location.pathname);
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0b0d13] px-6 text-center text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#121621] p-6 shadow-2xl">
          <h1 className="text-lg font-semibold text-white">舞台渲染意外中断</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {this.state.errorMessage || '切换人物或图形上下文时发生异常，可点击下方按钮恢复默认角色并重载舞台。'}
          </p>
          <button
            type="button"
            onClick={this.handleResetAndReload}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            恢复默认角色并重新加载
          </button>
        </div>
      </div>
    );
  }
}
