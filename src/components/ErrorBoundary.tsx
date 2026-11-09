import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0D14] text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#1A1D29] border border-[#2A2E45] p-6 text-center space-y-4 shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            <h2 className="text-lg font-bold text-white">ระบบพบข้อผิดพลาดชั่วคราว</h2>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              {this.state.error?.message || 'เกิดข้อผิดพลาดในการแสดงผล กรุณากดรีโหลดเพื่อเริ่มการทำงานใหม่อีกครั้ง'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-[#2A2E45] hover:bg-[#2D3345] text-xs font-semibold text-white transition-colors"
              >
                ลองอีกครั้ง
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl bg-[#7C6CFF] hover:bg-[#6855FF] text-xs font-semibold text-[#0F1117] transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>รีโหลดหน้าเว็บ</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
