import React, { useState, useMemo, useEffect } from 'react';
import { useProject } from './ProjectContext';
import { Settings, Printer, Download, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export default function PrintScreen() {
    const { projectState, updateProjectState } = useProject();

    // Default settings if undefined
    const settings = projectState?.print_settings || {
        paper_size: 'A4',
        book_size: 'A5',
        binding_method: 'saddle',
        has_back_cover: false,
        spine_mm: 5.0,
        binding_margin_mm: 10.0,
        crop_marks: true
    };

    const updateSettings = (updates: any) => {
        updateProjectState({ print_settings: { ...settings, ...updates } });
    };

    const totalPages = projectState?.visible_images.length || 0;
    
    // Saddle stitch warning
    const showSaddleWarning = settings.binding_method === 'saddle' && totalPages % 4 !== 0;

    return (
        <div className="flex flex-1 overflow-hidden relative bg-muted text-foreground">
            {/* Left/Right Sidebar for Settings */}
            <aside className="w-80 min-w-[320px] bg-card border-r border-border flex flex-col z-20 shadow-xl overflow-y-auto">
                <div className="p-4 border-b border-border flex items-center gap-2">
                    <Printer size={20} className="text-primary" />
                    <h2 className="font-bold whitespace-nowrap">印前配置 (Pre-Press)</h2>
                </div>
                
                <div className="p-4 flex flex-col gap-6 flex-1">
                    {/* Binding Method */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">装订方式</label>
                        <select 
                            className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            value={settings.binding_method}
                            onChange={(e) => updateSettings({ binding_method: e.target.value })}
                        >
                            <option value="saddle">骑马钉 (Saddle Stitch)</option>
                            <option value="perfect">无线胶装 (Perfect Binding)</option>
                            <option value="butterfly">蝴蝶对裱 (Butterfly)</option>
                        </select>
                    </div>

                    {showSaddleWarning && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 flex gap-2 text-yellow-600 dark:text-yellow-400">
                            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <strong>页数提示</strong><br/>
                                骑马钉要求总页数是 4 的倍数。当前有 {totalPages} 页，导出会自动在末尾填充空白页。
                            </div>
                        </div>
                    )}

                    {/* Paper & Book Size */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">尺寸规格</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-[10px] text-muted-foreground">打印纸张</span>
                                <select 
                                    className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={settings.paper_size}
                                    onChange={(e) => updateSettings({ paper_size: e.target.value })}
                                >
                                    <option value="A4">A4</option>
                                    <option value="A3">A3</option>
                                </select>
                            </div>
                            <div>
                                <span className="text-[10px] text-muted-foreground">成品裁切尺寸</span>
                                <select 
                                    className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={settings.book_size}
                                    onChange={(e) => updateSettings({ book_size: e.target.value })}
                                >
                                    <option value="A5">A5</option>
                                    <option value="A4">A4</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Margins */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">边距与留白</label>
                        
                        {settings.binding_method === 'perfect' && (
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between">
                                    <span className="text-sm">内侧刷胶区留白</span>
                                    <span className="text-xs font-mono">{settings.binding_margin_mm} mm</span>
                                </div>
                                <input type="range" min="0" max="30" step="1" className="w-full accent-primary" 
                                    value={settings.binding_margin_mm}
                                    onChange={e => updateSettings({ binding_margin_mm: parseFloat(e.target.value) })}
                                />
                            </div>
                        )}

                        <div className="flex flex-col gap-1 mt-2">
                            <div className="flex justify-between">
                                <span className="text-sm">连体封面书脊厚度</span>
                                <span className="text-xs font-mono">{settings.spine_mm} mm</span>
                            </div>
                            <input type="range" min="0" max="50" step="0.5" className="w-full accent-primary" 
                                value={settings.spine_mm}
                                onChange={e => updateSettings({ spine_mm: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>

                    {/* Options */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">选项</label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={settings.crop_marks} onChange={e => updateSettings({ crop_marks: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">生成印刷裁剪线 (Crop Marks)</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={settings.has_back_cover} onChange={e => updateSettings({ has_back_cover: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">最后一张作为封底</span>
                        </label>
                    </div>
                </div>

                <div className="p-4 border-t border-border">
                    <button className="w-full py-3 bg-primary text-primary-foreground rounded-md font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-md">
                        <Download size={18} />
                        生成高清 PDF
                    </button>
                </div>
            </aside>

            {/* Main Preview Area */}
            <main className="flex-1 p-8 overflow-y-auto flex flex-col items-center gap-8 pb-32">
                <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-600 px-4 py-2 rounded-md">
                    拼版物理预览视图开发中...
                </div>
            </main>
        </div>
    );
}
