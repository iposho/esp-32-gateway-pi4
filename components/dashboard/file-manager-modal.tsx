'use client'

import { useState, useEffect } from 'react'
import { X, Save, FolderOpen, RefreshCw, FileText, Trash2, ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { Telemetry } from '@/lib/types'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

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

    const payload = latestTelemetry.payload as Record<string, any>

    if (viewMode === 'list' && payload.fs_ls) {
      if (Array.isArray(payload.fs_ls)) {
        setFileList(payload.fs_ls)
        setIsRefreshing(false)
      }
    }

    if (viewMode === 'edit' && payload.fs_file === editingFile && typeof payload.content === 'string') {
      setFileContent(payload.content)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-xl sm:p-6">
      <Card className="flex h-[min(760px,92vh)] w-full max-w-3xl flex-col overflow-hidden border-white/10 bg-card/90 shadow-2xl">
        <div className="shrink-0 border-b border-border bg-background/35 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderOpen className="size-5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">LittleFS</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {viewMode === 'list' ? `${fileList.length} файлов на устройстве` : editingFile}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={isSending} title="Закрыть">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-background/20">
          {viewMode === 'list' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Файловая система</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ответы приходят асинхронно через MQTT.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isSending || isRefreshing} className="h-10">
                    <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Обновить
                  </Button>
                  <Button size="sm" onClick={handleCreateFile} disabled={isSending} className="h-10">
                    <Plus className="size-4" />
                    Создать
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background/55">
                {fileList.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                      <FolderOpen className="size-7 opacity-60" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Файлы не загружены</p>
                      <p className="mt-1 max-w-xs">Нажмите обновить или дождитесь ответа устройства.</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-full overflow-y-auto p-2">
                    {fileList.map((f, i) => (
                      <button
                        key={`${f.name}-${i}`}
                        type="button"
                        className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => handleOpenFile(f.name)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <FileText className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{f.name}</span>
                            <span className="text-xs text-muted-foreground">Открыть для редактирования</span>
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {formatBytes(f.size)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                <Button size="sm" variant="outline" onClick={() => { setViewMode('list'); handleRefresh() }} disabled={isSending} className="h-10 justify-start sm:w-28">
                  <ArrowLeft className="size-4" />
                  Назад
                </Button>
                <Input
                  value={editingFile}
                  onChange={e => setEditingFile(e.target.value)}
                  className="h-10 rounded-xl bg-background/65 font-mono text-sm"
                  disabled={isSending}
                  aria-label="Путь файла"
                />
              </div>

              <textarea
                className="min-h-0 flex-1 resize-none rounded-2xl border border-input bg-background/65 p-4 font-mono text-sm leading-6 transition-colors placeholder:text-muted-foreground focus:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={fileContent}
                onChange={e => setFileContent(e.target.value)}
                disabled={isSending || fileContent === 'Загрузка...'}
                placeholder="Содержимое файла..."
                spellCheck={false}
              />

              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isSending} className="h-10">
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSending} className="h-10">
                  <Save className="size-4" />
                  Сохранить файл
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
