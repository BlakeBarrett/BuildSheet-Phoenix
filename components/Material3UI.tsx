
import React from 'react';

export const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
  <div className={`bg-white rounded-[20px] border border-gray-200 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

// Added disabled prop to Button component definition
export const Button: React.FC<{ 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'ghost' | 'tonal', 
  children: React.ReactNode,
  className?: string,
  disabled?: boolean
}> = ({ onClick, variant = 'primary', children, className, disabled }) => {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md',
    secondary: 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200',
    tonal: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100'
  };

  const activeVariant = styles[variant as keyof typeof styles] || styles.primary;

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`px-5 py-2.5 rounded-full font-medium transition-all duration-200 text-sm flex items-center justify-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'} ${activeVariant} ${className}`}
    >
      {children}
    </button>
  );
};

export const Chip: React.FC<{ label: string, color?: string }> = ({ label, color = 'bg-gray-100 text-gray-700' }) => (
  <span className={`px-3 py-1 rounded-[8px] text-[11px] font-medium tracking-wide border border-transparent ${color}`}>
    {label}
  </span>
);

export const GoogleSignInButton: React.FC<{ onClick: () => void, label?: string, className?: string }> = ({ onClick, label = "Sign in with Google", className }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-center gap-3 bg-white text-[#1f1f1f] border border-[#747775] rounded-full px-4 py-2.5 text-sm font-medium hover:bg-[#F0F4F9] hover:border-[#1f1f1f] transition-all active:bg-[#E3E3E3] ${className}`}
    style={{ fontFamily: 'Roboto, sans-serif' }}
  >
    <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <g transform="matrix(1, 0, 0, 1, 0, 0)">
        <path fill="#4285F4" d="M23.49,12.27c0-0.79-0.07-1.54-0.19-2.27H12v4.51h6.47c-0.29,1.48-1.14,2.73-2.4,3.58v3h3.86 c2.26-2.09,3.56-5.17,3.56-8.82z"/>
        <path fill="#34A853" d="M12,24c3.24,0,5.95-1.08,7.92-2.91l-3.86-3c-1.08,0.72-2.45,1.16-4.06,1.16c-3.13,0-5.78-2.11-6.73-4.96 H1.29v3.09C3.3,21.3,7.31,24,12,24z"/>
        <path fill="#FBBC05" d="M5.27,14.29c-0.25-0.72-0.38-1.49-0.38-2.29s0.14-1.57,0.38-2.29V6.62H1.29C0.47,8.24,0,10.06,0,12 s0.47,3.76,1.29,5.38L5.27,14.29z"/>
        <path fill="#EA4335" d="M12,4.75c1.77,0,3.35,0.61,4.6,1.8l3.42-3.42C17.95,1.19,15.24,0,12,0C7.31,0,3.3,2.7,1.29,6.62l3.98,3.09 C6.22,6.86,8.87,4.75,12,4.75z"/>
      </g>
    </svg>
    <span>{label}</span>
  </button>
);
