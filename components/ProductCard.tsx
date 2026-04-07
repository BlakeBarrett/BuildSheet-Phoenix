import React from 'react';
import { ShoppingOption } from '../types';

export const ProductCard: React.FC<{ option: ShoppingOption; onSelect?: () => void }> = ({ option, onSelect }) => {
    const hasImage = !!option.thumbnail;

    return (
        <div 
            onClick={onSelect}
            className={`flex items-stretch bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${onSelect ? 'cursor-pointer hover:border-blue-500 hover:shadow-md transition-all' : ''}`}
        >
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-900 flex-shrink-0 flex items-center justify-center p-2">
                {hasImage ? (
                    <img 
                        src={option.thumbnail} 
                        alt={option.title} 
                        className="w-full h-full object-contain"
                        loading="lazy"
                    />
                ) : (
                    <div className="text-gray-400 mb-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>
                            widgets
                        </span>
                    </div>
                )}
            </div>
            
            <div className="p-3 flex flex-col justify-between flex-grow min-w-0">
                <div>
                    <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2" title={option.title}>
                        {option.title}
                    </h4>
                    <span className="text-xs text-gray-500 truncate block mt-1">
                        {option.source}
                    </span>
                </div>
                
                <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                        {option.price || 'Price varies'}
                    </span>
                    <a 
                        href={option.url} 
                        target="_blank" 
                        rel="norenoopener noreferrer"
                        className="text-xs text-blue-600 hover:underline inline-flex items-center"
                        onClick={(e) => e.stopPropagation()} // Prevent selecting if just clicking the link
                    >
                        View <span className="material-symbols-outlined ml-1 !text-[14px]">open_in_new</span>
                    </a>
                </div>
            </div>
        </div>
    );
};
