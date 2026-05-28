import React from 'react';

export default function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="admin-dark-page">{children}</div>;
}
