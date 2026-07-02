'use client'

import { useState, useEffect } from 'react'
import { X, Save, FolderOpen, RefreshCw, FileText, Trash2, ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { Telemetry } from '@/lib/types'

export function FileManagerModal({
  isOpen,
  onClose,
  onSend,
  isSending,
  latestTelemetry
}: {
  isOpen: boolean
  onClose: () => void
  onSend: (payload: Record<string, unknown>) => Promise<void>
  isSending: boolean
  latestTelemetry: Telemetry | null
}) {
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list')
  const [fileList, setFileList] = useState<{name: string, size: number}[]>([])
  const [editingFile, setEditingFile] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Обновление состояния из телеметрии
  useEffect(() => {
    if (!isOpen || !latestTelemetry) return

    if (viewMode === 'list' && latestTelemetry.fs_ls) {
      if (Array.isArray(latestTelemetry.fs_ls)) {
        setFileList(latestTelemetry.fs_ls)
        setIsRefreshing(false)
      }
    }

    if (viewMode === 'edit' && latestTelemetry.fs_file === editingFile && typeof latestTelemetry.content === 'string') {
      setFileContent(latestTelemetry.content)
    }
  }, [latestTelemetry, isOpen, viewMode, editingFile])

  // Авто-обновление списка при открытии модалки
  useEffect(() => {
    if (isOpen && viewMode === 'list') {
      handleRefresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const handleRefresh = () => {
    setIsRefreshing(true)
    onSend({ action: 'fs_ls', path: '/' })
  }

  const handleOpenFile = (filename: string) => {
    setEditingFile(filename)
    setFileContent('Загрузка...')
    setViewMode('edit')
    onSend({ action: 'fs_read', path: filename })
  }

  const handleCreateFile = () => {
    setEditingFile('/newfile.txt')
    setFileContent('')
    setViewMode('edit')
  }

  const handleSave = () => {
    if (!editingFile.startsWith('/')) {
      alert('Имя файла должно начинаться со слэша /')
      return
    }
    onSend({ action: 'fs_write', path: editingFile, content: fileContent })
  }

  const handleDelete = () => {
    if (confirm(`Точно удалить ${editingFile}?`)) {
      onSend({ action: 'fs_rm', path: editingFile })
      setViewMode('list')
      setTimeout(() => handleRefresh(), 1000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md overflow-hidden flex flex-col border-border/50 shadow-2xl h-[500px]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30 shrink-0">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <FolderOpen className="size-4 text-emerald-500" />
            Менеджер файлов (LittleFS)
          </h3>
          <Button variant="ghost" size="icon-xs" onClick={onClose} disabled={isSending}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-background/50 flex flex-col relative">
          {viewMode === 'list' ? (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
              <div className="flex justify-between items-center shrink-0">
                <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isSending || isRefreshing}>
                  <RefreshCw className={`size-3 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Обновить
                </Button>
                <Button size="sm" onClick={handleCreateFile} disabled={isSending}>
                  <Plus className="size-3 mr-1.5" />
                  Создать
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto border border-border rounded-md bg-background">
                {fileList.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <FolderOpen className="size-8 opacity-20" />
                    <p>Нет файлов или ожидание ответа...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {fileList.map((f, i) => (
                      <div key={i} className="flex justify-between items-center p-3 hover:bg-muted/50 transition-colors group">
                        <div 
                          className="flex items-center gap-3 cursor-pointer flex-1" 
                          onClick={() => handleOpenFile(f.name)}
                        >
                          <FileText className="size-4 text-primary/60 group-hover:text-primary transition-colors" />
                          <span className="text-sm font-medium">{f.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap bg-muted px-2 py-0.5 rounded-full">{f.size} B</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground text-center shrink-0">
                Данные загружаются асинхронно через MQTT.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 shrink-0">
                <Button size="icon-xs" variant="ghost" onClick={() => { setViewMode('list'); handleRefresh() }} disabled={isSending}>
                  <ArrowLeft className="size-4" />
                </Button>
                <Input 
                  value={editingFile} 
                  onChange={e => setEditingFile(e.target.value)} 
                  className="h-9 font-mono text-sm bg-muted/50 focus-visible:bg-background"
                  disabled={isSending}
                />
              </div>
              <textarea
                className="flex-1 w-full rounded-md border border-input bg-background/50 focus:bg-background p-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50 resize-none transition-colors"
                value={fileContent}
                onChange={e => setFileContent(e.target.value)}
                disabled={isSending || fileContent === 'Загрузка...'}
                placeholder="Содержимое файла..."
                spellCheck={false}
              />
              <div className="flex justify-between items-center shrink-0">
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isSending}>
                  <Trash2 className="size-3 mr-1.5" />
                  Удалить
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSending}>
                  <Save className="size-3 mr-1.5" />
                  Сохранить
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
