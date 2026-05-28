import React, { useState } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface LabelProps {
  htmlFor?: string;
  label: string;
  required?: boolean;
  hint?: string;
  style?: React.CSSProperties;
}

export const FormField = ({ children, className = '', style }: { children: React.ReactNode, className?: string, style?: React.CSSProperties }) => (
  <div className={`admin-form-field ${className}`} style={{ marginBottom: '20px', width: '100%', ...style }}>
    {children}
  </div>
);

export const FormGrid = ({ children, columns = 2, gap = 20 }: { children: React.ReactNode, columns?: number, gap?: number }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap}px` }}>
    {children}
  </div>
);

export const FormLabel = ({ htmlFor, label, required, hint, style }: LabelProps) => (
  <div style={{ marginBottom: '8px' }}>
    <label 
      htmlFor={htmlFor} 
      style={{ 
        display: 'block', 
        fontSize: '0.75rem', 
        fontWeight: 800, 
        color: 'var(--adm-text, #e2e8f0)', 
        textTransform: 'uppercase', 
        letterSpacing: '1px',
        ...style
      }}
    >
      {label} {required && <span style={{ color: '#e74c3c' }}>*</span>}
    </label>
    {hint && <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted, #888)', margin: '4px 0 0' }}>{hint}</p>}
  </div>
);

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const FormInput = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', icon, ...props }, ref) => (
  <div style={{ position: 'relative' }}>
    {icon && (
      <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#999', pointerEvents: 'none' }}>
        {icon}
      </div>
    )}
    <input
      ref={ref}
      className={`admin-input ${className}`}
      style={{
        width: '100%',
        padding: `12px 16px ${icon ? '12px 40px' : ''}`,
        backgroundColor: 'var(--adm-surface-2, #071A45)',
        border: '1px solid var(--adm-border, #123068)',
        borderRadius: '12px',
        fontSize: '0.95rem',
        color: 'var(--adm-text, #e2e8f0)',
        transition: 'all 0.2s ease-in-out',
        fontFamily: 'inherit',
        outline: 'none'
      }}
      {...props}
    />
  </div>
));
FormInput.displayName = 'FormInput';

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`admin-input ${className}`}
    style={{
      width: '100%',
      padding: '12px 16px',
      backgroundColor: 'var(--adm-surface-2, #071A45)',
      border: '1px solid var(--adm-border, #123068)',
      borderRadius: '12px',
      fontSize: '0.95rem',
      color: 'var(--adm-text, #e2e8f0)',
      transition: 'all 0.2s ease-in-out',
      fontFamily: 'inherit',
      minHeight: '100px',
      resize: 'vertical',
      outline: 'none'
    }}
    {...props}
  />
));
FormTextarea.displayName = 'FormTextarea';

export const FormSelect = React.forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className = '', children, ...props }, ref) => (
  <select
    ref={ref}
    className={`admin-input ${className}`}
    style={{
      width: '100%',
      padding: '12px 16px',
      backgroundColor: 'var(--adm-surface-2, #071A45)',
      border: '1px solid var(--adm-border, #123068)',
      borderRadius: '12px',
      fontSize: '0.95rem',
      color: 'var(--adm-text, #e2e8f0)',
      transition: 'all 0.2s ease-in-out',
      fontFamily: 'inherit',
      outline: 'none',
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 16px center',
      backgroundSize: '16px'
    }}
    {...props}
  >
    {children}
  </select>
));
FormSelect.displayName = 'FormSelect';

export const FormSwitch = ({ checked, onChange, label, hint }: { checked: boolean, onChange: (c: boolean) => void, label: string, hint?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={() => onChange(!checked)}>
    <div 
      style={{ 
        width: '50px', height: '28px', borderRadius: '30px', 
        backgroundColor: checked ? 'var(--adm-accent, #6BFF2A)' : 'var(--adm-border, #123068)',
        position: 'relative', transition: 'background-color 0.3s' 
      }}
    >
      <div 
        style={{
          width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#fff',
          position: 'absolute', top: '3px', left: checked ? '25px' : '3px',
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </div>
    <div>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--adm-text, #e2e8f0)' }}>{label}</span>
      {hint && <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted, #888)', margin: 0 }}>{hint}</p>}
    </div>
  </div>
);

export const FormActions = ({ children }: { children: React.ReactNode }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'flex-end', 
    gap: '12px', 
    marginTop: '30px', 
    paddingTop: '20px', 
    borderTop: '1px solid #eee' 
  }}>
    {children}
  </div>
);

export const Tabs = ({ tabs, activeTab, onChange }: { tabs: { id: string, label: string, icon: React.ReactNode }[], activeTab: string, onChange: (id: string) => void }) => (
  <div style={{ display: 'flex', gap: '5px', borderBottom: '1px solid var(--adm-border, #123068)', marginBottom: '25px', overflowX: 'auto' }}>
    {tabs.map(tab => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          background: 'none',
          border: 'none',
          borderBottom: activeTab === tab.id ? '3px solid var(--adm-accent, #6BFF2A)' : '3px solid transparent',
          color: activeTab === tab.id ? 'var(--adm-accent, #6BFF2A)' : 'var(--adm-text-muted, #64748b)',
          fontWeight: activeTab === tab.id ? 800 : 600,
          fontSize: '0.9rem',
          cursor: 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
      >
        {tab.icon}
        {tab.label}
      </button>
    ))}
  </div>
);

export const FormHeader = ({ title, icon }: { title: string, icon: React.ReactNode }) => (
  <div className="admin-form-header-bg">
    {icon && <div style={{ background: '#071A45', borderRadius: '50%', padding: '4px', display: 'flex' }}>{icon}</div>}
    <h3>{title}</h3>
  </div>
);
