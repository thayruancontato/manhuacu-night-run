import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type SkeletonBlockProps = {
  width: number | string;
  height: number | string;
  radius: number | string;
  className?: string;
  style?: CSSProperties;
};

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = 10,
  className = '',
  style,
}: SkeletonBlockProps) {
  return (
    <span
      className={`ui-skeleton-block ${className}`.trim()}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 2, widths }: { lines: number; widths: Array<number | string> }) {
  return (
    <div className="ui-skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={index}
          height={index === 0 ? 14 : 11}
          width={widths?.[index] || (index === lines - 1 ? '62%' : '100%')}
          radius={999}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`ui-skeleton-card ${className}`.trim()} style={style}>{children}</div>;
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="ui-skeleton-table" aria-hidden="true">
      <div className="ui-skeleton-table-head">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={index} height={10} width={index === 0 ? 90 : 70} radius={999} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="ui-skeleton-table-row" key={rowIndex}>
          <div className="ui-skeleton-person">
            <SkeletonBlock width={42} height={42} radius={12} />
            <div>
              <SkeletonBlock height={12} width={150} radius={999} />
              <SkeletonBlock height={10} width={110} radius={999} style={{ marginTop: 8 }} />
            </div>
          </div>
          {Array.from({ length: Math.max(columns - 1, 0) }).map((_, colIndex) => (
            <SkeletonBlock key={colIndex} height={12} width={colIndex === columns - 2 ? 52 : 92} radius={999} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AdminPageSkeleton({ variant = 'dashboard' }: { variant?: 'dashboard' | 'financeiro' | 'table' | 'detail' }) {
  const isFinanceiro = variant === 'financeiro';
  const isDetail = variant === 'detail';

  return (
    <div className="ui-skeleton-page">
      <div className="ui-skeleton-header">
        <div>
          <SkeletonBlock height={28} width={isDetail ? 260 : 220} radius={999} />
          <SkeletonBlock height={13} width={isDetail ? 360 : 420} radius={999} style={{ marginTop: 12 }} />
        </div>
        <div className="ui-skeleton-actions">
          <SkeletonBlock height={42} width={150} radius={12} />
          <SkeletonBlock height={42} width={170} radius={12} />
        </div>
      </div>

      {isDetail ? (
        <>
          <SkeletonCard className="ui-skeleton-detail-hero">
            <SkeletonBlock width={96} height={96} radius={24} />
            <div style={{ flex: 1 }}>
              <SkeletonBlock height={24} width="45%" radius={999} />
              <SkeletonText lines={3} widths={['70%', '54%', '38%']} />
            </div>
          </SkeletonCard>
          <div className="ui-skeleton-grid two">
            <SkeletonCard><SkeletonText lines={8} widths={['38%', '88%', '76%', '64%', '91%', '52%', '82%', '46%']} /></SkeletonCard>
            <SkeletonCard><SkeletonText lines={8} widths={['42%', '72%', '66%', '80%', '55%', '90%', '58%', '74%']} /></SkeletonCard>
          </div>
        </>
      ) : (
        <>
          <div className="ui-skeleton-grid stats">
            {Array.from({ length: isFinanceiro ? 4 : 3 }).map((_, index) => (
              <SkeletonCard key={index}>
                <div className="ui-skeleton-stat-top">
                  <SkeletonBlock width={44} height={44} radius={12} />
                  <SkeletonBlock width={76} height={24} radius={999} />
                </div>
                <SkeletonBlock height={24} width="48%" radius={999} />
                <SkeletonText lines={2} widths={['60%', '42%']} />
              </SkeletonCard>
            ))}
          </div>

          {isFinanceiro && (
            <div className="ui-skeleton-grid two">
              <SkeletonCard><SkeletonText lines={3} widths={['35%', '28%', '18%']} /></SkeletonCard>
              <SkeletonCard><SkeletonText lines={3} widths={['35%', '28%', '18%']} /></SkeletonCard>
            </div>
          )}

          {variant !== 'table' && (
            <div className="ui-skeleton-grid charts">
              <SkeletonCard>
                <SkeletonBlock height={18} width={180} radius={999} />
                <SkeletonBlock height={220} width="100%" radius={18} style={{ marginTop: 22 }} />
              </SkeletonCard>
              <SkeletonCard>
                <SkeletonBlock height={18} width={160} radius={999} />
                <SkeletonBlock height={180} width={180} radius={999} style={{ margin: '28px auto 0' }} />
              </SkeletonCard>
            </div>
          )}

          <SkeletonCard>
            <SkeletonTable rows={6} columns={isFinanceiro ? 6 : 5} />
          </SkeletonCard>
        </>
      )}
    </div>
  );
}

export function AdminLayoutSkeleton({ variant = 'dashboard' }: { variant: 'dashboard' | 'financeiro' | 'table' | 'detail' }) {
  return (
    <div className="admin-dark-layout ui-skeleton-admin-layout">
      <aside className="adm-sidebar ui-skeleton-sidebar">
        <div className="adm-sidebar-logo">
          <SkeletonBlock width="78%" height={46} radius={12} />
        </div>

        <div className="adm-event-date ui-skeleton-sidebar-date">
          <SkeletonBlock width={38} height={38} radius={10} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="62%" height={11} radius={999} />
            <SkeletonBlock width="86%" height={10} radius={999} style={{ marginTop: 8 }} />
          </div>
        </div>

        <nav className="adm-sidebar-nav ui-skeleton-sidebar-nav">
          {Array.from({ length: 11 }).map((_, index) => (
            <div className="adm-nav-item ui-skeleton-sidebar-item" key={index}>
              <SkeletonBlock width={22} height={22} radius={7} />
              <SkeletonBlock width={index % 3 === 0 ? '58%' : index % 3 === 1 ? '74%' : '46%'} height={12} radius={999} />
            </div>
          ))}
        </nav>

        <div className="adm-sidebar-footer">
          <div className="admin-profile ui-skeleton-profile">
            <SkeletonBlock width={42} height={42} radius={12} />
            <div style={{ flex: 1 }}>
              <SkeletonBlock width="68%" height={12} radius={999} />
              <SkeletonBlock width="90%" height={10} radius={999} style={{ marginTop: 8 }} />
            </div>
          </div>
          <SkeletonBlock width="100%" height={42} radius={12} />
        </div>
      </aside>

      <main className="admin-dark-main">
        <AdminPageSkeleton variant={variant} />
      </main>
    </div>
  );
}

export function SkeletonReveal({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (loading) {
      setShowSkeleton(true);
      setExiting(false);
      return;
    }

    if (!showSkeleton) return;
    setExiting(true);
    const timer = window.setTimeout(() => {
      setShowSkeleton(false);
      setExiting(false);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [loading, showSkeleton]);

  if (loading) {
    return <div className="ui-skeleton-exit-wrap">{skeleton}</div>;
  }

  if (showSkeleton && exiting) {
    return (
      <div className="ui-skeleton-reveal-stage">
        <div className="ui-skeleton-live-content">{children}</div>
        <div className="ui-skeleton-exit-wrap is-exiting">{skeleton}</div>
      </div>
    );
  }

  return <div className="ui-skeleton-content-enter">{children}</div>;
}
