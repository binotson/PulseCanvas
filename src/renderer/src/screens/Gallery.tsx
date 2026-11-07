import { Download, ImageOff, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { GalleryItem } from '@shared/api'
import { ART_META } from '../art'
import { Button, PageHeader, formatBytes } from '../components/ui'
import { navigate, toast } from '../lib/session'

function useArtworkImage(id: string): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.pulse.gallery.read(id).then((d) => alive && setSrc(d))
    return () => {
      alive = false
    }
  }, [id])
  return src
}

function Thumb({ item, onOpen }: { item: GalleryItem; onOpen: () => void }): ReactNode {
  const src = useArtworkImage(item.id)
  return (
    <button
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-line bg-ink-2 text-left transition hover:border-violet/40"
    >
      <div className="aspect-video w-full overflow-hidden bg-ink">
        {src && <img src={src} alt={item.title} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />}
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium">{item.title}</div>
        <div className="mt-0.5 text-xs text-faint">
          {ART_META[item.mode]?.name ?? item.mode} · {item.width}×{item.height} · {formatBytes(item.bytes)}
        </div>
      </div>
    </button>
  )
}

function Viewer({ item, onClose, onDeleted }: { item: GalleryItem; onClose: () => void; onDeleted: () => void }): ReactNode {
  const src = useArtworkImage(item.id)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 p-6 backdrop-blur" role="dialog" aria-modal aria-label={item.title}>
      <div className="mb-4 flex items-center gap-3">
        <div>
          <div className="font-display text-lg font-semibold">{item.title}</div>
          <div className="text-xs text-faint">
            {new Date(item.createdAt).toLocaleString()} {item.caption ? `· ${item.caption}` : ''}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              const r = await window.pulse.gallery.exportPng(item.id)
              if (r.saved) toast(`Exported to ${r.path}`)
            }}
          >
            <Download size={16} /> Export PNG
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await window.pulse.gallery.remove(item.id)
              toast('Artwork deleted')
              onDeleted()
            }}
          >
            <Trash2 size={16} /> Delete
          </Button>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {src && <img src={src} alt={item.title} className="max-h-full max-w-full rounded-2xl shadow-2xl" />}
      </div>
    </div>
  )
}

export function Gallery(): ReactNode {
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [open, setOpen] = useState<GalleryItem | null>(null)
  const load = useCallback(() => {
    void window.pulse.gallery.list().then(setItems)
  }, [])
  useEffect(load, [load])

  return (
    <div className="h-full overflow-y-auto p-10">
      <PageHeader
        title="Gallery"
        subtitle="Artworks you saved from the studio. They are stored only on this computer — export any piece as a full-resolution PNG."
      />
      {items && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line py-20 text-center">
          <ImageOff size={32} className="text-faint" />
          <div className="mt-3 font-medium">No artworks yet</div>
          <div className="mt-1 text-sm text-muted">Start a live session and press “Save artwork” to keep a piece.</div>
          <Button variant="primary" className="mt-5" onClick={() => navigate('studio')}>
            Go to the studio
          </Button>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
        {items?.map((it) => <Thumb key={it.id} item={it} onOpen={() => setOpen(it)} />)}
      </div>
      {open && (
        <Viewer
          item={open}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null)
            load()
          }}
        />
      )}
    </div>
  )
}
