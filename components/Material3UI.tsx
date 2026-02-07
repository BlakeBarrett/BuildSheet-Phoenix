import React from 'react';

// M3 Card: Elevated or Filled surface with large corner radius
export const Card: React.FC<{ children: React.ReactNode, className?: string, onClick?: () => void, variant?: 'elevated' | 'filled' | 'outlined' }> = ({ children, className, onClick, variant = 'elevated' }) => {
  const baseStyles = "rounded-[24px] overflow-hidden transition-all duration-300";
  const variants = {
    elevated: "bg-white shadow-sm hover:shadow-md",
    filled: "bg-[#F3F4F6] border-none", // Surface Container Highest
    outlined: "bg-white border border-[#E0E2E7]"
  };

  return (
    <div 
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {children}
    </div>
  );
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'tonal' | 'fab';
  icon?: string;
}

// M3 Button: Full pill shape, strict height metrics
export const Button: React.FC<ButtonProps> = ({ 
  onClick, 
  variant = 'primary', 
  children, 
  className, 
  disabled,
  icon,
  ...props 
}) => {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md active:scale-[0.98]',
    secondary: 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-100',
    tonal: 'bg-[#E0E2E7] text-[#1F1F1F] hover:bg-[#D3D6DB] active:bg-[#C4C7C5]',
    ghost: 'bg-transparent text-[#444746] hover:bg-[#F0F4F9]',
    fab: 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200 shadow-md rounded-[20px] h-14 min-w-[56px]'
  };

  const activeVariant = styles[variant as keyof typeof styles] || styles.primary;

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`
        relative px-6 py-3 rounded-full font-medium text-sm tracking-wide 
        flex items-center justify-center gap-2 transition-all duration-300
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        ${activeVariant} ${className}
      `}
      {...props}
    >
      {icon && <span className="material-symbols-rounded text-[20px]">{icon}</span>}
      {children}
    </button>
  );
};

// M3 Icon Button
export const IconButton: React.FC<{ icon: string, onClick?: () => void, className?: string, active?: boolean, disabled?: boolean, title?: string }> = ({ icon, onClick, className, active, disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200
      disabled:opacity-30 disabled:cursor-not-allowed
      ${active ? 'bg-indigo-100 text-indigo-800' : 'text-[#444746] hover:bg-[#F0F4F9] hover:text-[#1F1F1F]'}
      ${className}
    `}
  >
    <span className={`material-symbols-rounded ${active ? 'symbol-filled' : ''}`}>{icon}</span>
  </button>
);

// M3 Chip: Assist or Filter style
export const Chip: React.FC<{ label: string, color?: string, icon?: string, onClick?: () => void }> = ({ label, color, icon, onClick }) => (
  <button 
    onClick={onClick}
    className={`
      h-8 px-3 rounded-[8px] text-[11px] font-bold tracking-wider flex items-center gap-1.5 border
      ${color ? color : 'bg-white border-[#C4C7C5] text-[#444746] hover:bg-[#F0F4F9]'}
    `}
  >
    {icon && <span className="material-symbols-rounded text-[14px]">{icon}</span>}
    {label}
  </button>
);

export const GoogleSignInButton: React.FC<{ onClick: () => void, label?: string, className?: string }> = ({ onClick, label = "Sign in with Google", className }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-center gap-3 bg-white text-[#1f1f1f] border border-[#747775] rounded-full px-4 py-2.5 text-sm font-medium hover:bg-[#F0F4F9] hover:border-[#1f1f1f] transition-all active:bg-[#E3E3E3] ${className}`}
    style={{ fontFamily: 'Roboto, sans-serif' }}
  >
    {/* SVG retained for brand compliance */}
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