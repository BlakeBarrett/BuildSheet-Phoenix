
import React from 'react';

export const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
  <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

export const Button: React.FC<{ 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'ghost', 
  children: React.ReactNode,
  className?: string
}> = ({ onClick, variant = 'primary', children, className }) => {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100'
  };

  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-full font-medium transition-all text-sm active:scale-95 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Chip: React.FC<{ label: string, color?: string }> = ({ label, color = 'bg-gray-100 text-gray-700' }) => (
  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${color}`}>
    {label}
  </span>
);
