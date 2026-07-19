import { useEffect, useRef, useState } from 'react'
import './App.css'

interface TextLayer {
  id: string
  content: string
  x: number
  y: number
  fontSize: number
  color: string
}

const ASPECT_RATIOS = {
  original: { label: 'オリジナル', ratio: null },
  square: { label: 'フィード（1:1）', ratio: 1 },
  portrait: { label: 'ポートレート（4:5）', ratio: 4 / 5 },
  story: { label: 'ストーリーズ/リール（9:16）', ratio: 9 / 16 },
  landscape: { label: '横長（1.91:1）', ratio: 1.91 },
} as const

type AspectRatioKey = keyof typeof ASPECT_RATIOS

type DragState =
  | { kind: 'text'; id: string; offsetX: number; offsetY: number }
  | { kind: 'image'; startX: number; startY: number; startPanXNorm: number; startPanYNorm: number }

// 指定した比率・枠幅のもとで、枠の内側（写真が入る領域）のピクセルサイズを求める。
// 「キャンバス全体が指定比率どおり」かつ「枠幅は上下左右で均一」になるよう、
// 画像側ではなくこの内側領域のサイズを起点に組み立てる。
function computeContentSize(image: HTMLImageElement, frameWidth: number, targetRatio: number | null) {
  if (targetRatio === null) {
    return { contentWidth: image.width, contentHeight: image.height }
  }

  let contentHeight = image.height
  let canvasHeight = contentHeight + frameWidth * 2
  let canvasWidth = targetRatio * canvasHeight
  let contentWidth = canvasWidth - frameWidth * 2

  if (contentWidth > image.width) {
    contentWidth = image.width
    canvasWidth = contentWidth + frameWidth * 2
    canvasHeight = canvasWidth / targetRatio
    contentHeight = canvasHeight - frameWidth * 2
  }

  return { contentWidth, contentHeight }
}

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [frameColor, setFrameColor] = useState('#ffffff')
  const [frameWidth, setFrameWidth] = useState(40)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [aspectRatioKey, setAspectRatioKey] = useState<AspectRatioKey>('original')
  const [zoom, setZoom] = useState(1)
  const [panXNorm, setPanXNorm] = useState(0.5)
  const [panYNorm, setPanYNorm] = useState(0.5)
  const [texts, setTexts] = useState<TextLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const liveRef = useRef({ frameWidth, aspectRatioKey, zoom, image })
  liveRef.current = { frameWidth, aspectRatioKey, zoom, image }

  const selectedText = texts.find((t) => t.id === selectedId) ?? null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        setImage(img)
        setZoom(1)
        setPanXNorm(0.5)
        setPanYNorm(0.5)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const targetRatio = ASPECT_RATIOS[aspectRatioKey].ratio
    const { contentWidth, contentHeight } = computeContentSize(image, frameWidth, targetRatio)

    const canvasWidth = contentWidth + frameWidth * 2
    const canvasHeight = contentHeight + frameWidth * 2

    canvas.width = canvasWidth
    canvas.height = canvasHeight

    ctx.fillStyle = frameColor
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    const baseScale = Math.max(contentWidth / image.width, contentHeight / image.height)
    const effectiveScale = baseScale * zoom
    const displayedWidth = image.width * effectiveScale
    const displayedHeight = image.height * effectiveScale
    const panX = (contentWidth - displayedWidth) * panXNorm
    const panY = (contentHeight - displayedHeight) * panYNorm

    ctx.save()
    ctx.beginPath()
    ctx.rect(frameWidth, frameWidth, contentWidth, contentHeight)
    ctx.clip()
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
    ctx.drawImage(
      image,
      0,
      0,
      image.width,
      image.height,
      frameWidth + panX,
      frameWidth + panY,
      displayedWidth,
      displayedHeight,
    )
    ctx.filter = 'none'
    ctx.restore()

    for (const text of texts) {
      ctx.font = `bold ${text.fontSize}px sans-serif`
      ctx.fillStyle = text.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text.content, text.x, text.y)

      if (text.id === selectedId) {
        const metrics = ctx.measureText(text.content)
        const padding = 8
        ctx.save()
        ctx.strokeStyle = '#4b9bff'
        ctx.setLineDash([6, 4])
        ctx.strokeRect(
          text.x - metrics.width / 2 - padding,
          text.y - text.fontSize / 2 - padding,
          metrics.width + padding * 2,
          text.fontSize + padding * 2,
        )
        ctx.restore()
      }
    }
  }, [
    image,
    frameColor,
    frameWidth,
    brightness,
    contrast,
    saturation,
    aspectRatioKey,
    zoom,
    panXNorm,
    panYNorm,
    texts,
    selectedId,
  ])

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const hitTestText = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return null

    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i]
      ctx.font = `bold ${text.fontSize}px sans-serif`
      const width = ctx.measureText(text.content).width
      const padding = 8
      if (
        x >= text.x - width / 2 - padding &&
        x <= text.x + width / 2 + padding &&
        y >= text.y - text.fontSize / 2 - padding &&
        y <= text.y + text.fontSize / 2 + padding
      ) {
        return text
      }
    }
    return null
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e)
    const hit = hitTestText(point.x, point.y)

    if (hit) {
      setSelectedId(hit.id)
      dragRef.current = { kind: 'text', id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y }
      return
    }

    setSelectedId(null)
    if (liveRef.current.image) {
      dragRef.current = { kind: 'image', startX: point.x, startY: point.y, startPanXNorm: panXNorm, startPanYNorm: panYNorm }
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      const canvas = canvasRef.current
      if (!drag || !canvas) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY

      if (drag.kind === 'text') {
        setTexts((prev) =>
          prev.map((t) => (t.id === drag.id ? { ...t, x: x - drag.offsetX, y: y - drag.offsetY } : t)),
        )
        return
      }

      const { frameWidth, aspectRatioKey, zoom, image } = liveRef.current
      if (!image) return

      const targetRatio = ASPECT_RATIOS[aspectRatioKey].ratio
      const { contentWidth, contentHeight } = computeContentSize(image, frameWidth, targetRatio)
      const baseScale = Math.max(contentWidth / image.width, contentHeight / image.height)
      const effectiveScale = baseScale * zoom
      const displayedWidth = image.width * effectiveScale
      const displayedHeight = image.height * effectiveScale
      const slackX = contentWidth - displayedWidth
      const slackY = contentHeight - displayedHeight

      const dx = x - drag.startX
      const dy = y - drag.startY
      const startPanX = slackX * drag.startPanXNorm
      const startPanY = slackY * drag.startPanYNorm

      const clamp = (value: number, slack: number) => {
        const lo = Math.min(0, slack)
        const hi = Math.max(0, slack)
        return Math.min(hi, Math.max(lo, value))
      }

      const newPanX = clamp(startPanX + dx, slackX)
      const newPanY = clamp(startPanY + dy, slackY)

      setPanXNorm(slackX !== 0 ? newPanX / slackX : 0.5)
      setPanYNorm(slackY !== 0 ? newPanY / slackY : 0.5)
    }

    const handleMouseUp = () => {
      dragRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleAddText = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const id = crypto.randomUUID()
    const newText: TextLayer = {
      id,
      content: 'テキスト',
      x: canvas.width / 2,
      y: canvas.height / 2,
      fontSize: 48,
      color: '#ffffff',
    }
    setTexts((prev) => [...prev, newText])
    setSelectedId(id)
  }

  const updateSelectedText = (patch: Partial<TextLayer>) => {
    if (!selectedId) return
    setTexts((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)))
  }

  const handleDeleteSelected = () => {
    if (!selectedId) return
    setTexts((prev) => prev.filter((t) => t.id !== selectedId))
    setSelectedId(null)
  }

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement('a')
    link.download = 'framed-image.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="eyebrow">INSTA FRAME EDITOR</span>
        <h1>Instagram用 枠つけエディタ</h1>
        <p>枠・フィルター・テキスト・投稿サイズをその場でプレビューしながら編集</p>
      </header>

      <div className="editor-layout">
        <div className="sidebar">
          <div className="panel">
            <label className="upload-button">
              {image ? '画像を変更' : '画像を選択'}
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>

          {image && (
            <>
              <div className="panel">
                <div className="panel-title">枠・サイズ</div>
                <div className="field-grid">
                  <label className="field">
                    枠の色
                    <input
                      type="color"
                      value={frameColor}
                      onChange={(e) => setFrameColor(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    枠の太さ（{frameWidth}px）
                    <input
                      type="range"
                      min={0}
                      max={150}
                      value={frameWidth}
                      onChange={(e) => setFrameWidth(Number(e.target.value))}
                    />
                  </label>

                  <label className="field" style={{ flexBasis: '100%' }}>
                    投稿サイズ
                    <select
                      value={aspectRatioKey}
                      onChange={(e) => setAspectRatioKey(e.target.value as AspectRatioKey)}
                    >
                      {Object.entries(ASPECT_RATIOS).map(([key, { label }]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field" style={{ flexBasis: '100%' }}>
                    画像の大きさ（{Math.round(zoom * 100)}%）
                    <input
                      type="range"
                      min={100}
                      max={300}
                      value={Math.round(zoom * 100)}
                      onChange={(e) => setZoom(Number(e.target.value) / 100)}
                    />
                  </label>

                  <p className="field-hint">プレビュー内をドラッグすると画像の位置を調整できます</p>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">フィルター・色調補正</div>
                <div className="field-grid">
                  <label className="field">
                    明るさ（{brightness}%）
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    コントラスト（{contrast}%）
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    彩度（{saturation}%）
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">テキスト</div>
                <button className="btn" onClick={handleAddText} style={{ width: '100%' }}>
                  ＋ テキストを追加
                </button>

                {selectedText && (
                  <div className="text-panel-body">
                    <label className="field">
                      内容
                      <input
                        type="text"
                        value={selectedText.content}
                        onChange={(e) => updateSelectedText({ content: e.target.value })}
                      />
                    </label>

                    <div className="field-grid">
                      <label className="field">
                        文字サイズ（{selectedText.fontSize}px）
                        <input
                          type="range"
                          min={16}
                          max={120}
                          value={selectedText.fontSize}
                          onChange={(e) => updateSelectedText({ fontSize: Number(e.target.value) })}
                        />
                      </label>

                      <label className="field">
                        文字色
                        <input
                          type="color"
                          value={selectedText.color}
                          onChange={(e) => updateSelectedText({ color: e.target.value })}
                        />
                      </label>
                    </div>

                    <button className="btn btn-danger" onClick={handleDeleteSelected}>
                      このテキストを削除
                    </button>
                  </div>
                )}
              </div>

              <button className="btn btn-primary" onClick={handleDownload}>
                ダウンロード
              </button>
            </>
          )}
        </div>

        <div className="preview-pane">
          {image ? (
            <canvas
              ref={canvasRef}
              className="preview-canvas"
              onMouseDown={handleCanvasMouseDown}
            />
          ) : (
            <p className="placeholder">
              <span className="placeholder-icon">🖼️</span>
              画像をアップロードするとここにプレビューが表示されます
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
