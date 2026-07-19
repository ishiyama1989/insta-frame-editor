import { useEffect, useRef, useState } from 'react'
import './App.css'

interface TextLayer {
  id: string
  content: string
  x: number
  y: number
  fontSize: number
  color: string
  fontFamily: string
}

const FONT_OPTIONS = [
  { key: 'gothic', label: 'ゴシック', family: "'Zen Kaku Gothic New', sans-serif" },
  { key: 'maru', label: '丸ゴシック', family: "'Zen Maru Gothic', sans-serif" },
  { key: 'mincho', label: '明朝', family: "'Noto Serif JP', serif" },
  { key: 'hand', label: '手書き風', family: "'Yomogi', cursive" },
] as const

const FRAME_PRESETS = [
  { label: '細め', px: 20 },
  { label: 'ふつう', px: 60 },
  { label: '太め', px: 150 },
] as const

const CENTER_SNAP_THRESHOLD = 12

const ASPECT_RATIOS = {
  original: { label: 'オリジナル', ratio: null },
  square: { label: 'フィード 1:1', ratio: 1 },
  portrait: { label: 'ポートレート 4:5', ratio: 4 / 5 },
  story: { label: 'ストーリーズ 9:16', ratio: 9 / 16 },
  landscape: { label: '横長 1.91:1', ratio: 1.91 },
} as const

type AspectRatioKey = keyof typeof ASPECT_RATIOS
type FrameMode = 'uniform' | 'custom'

const COLOR_PRESETS = ['#faf5eb', '#3d3226', '#e2d5bf', '#b06a45', '#7d8a5c']

interface FrameSides {
  top: number
  bottom: number
  left: number
  right: number
}

type DragState =
  | { kind: 'text'; id: string; offsetX: number; offsetY: number }
  | { kind: 'image'; startX: number; startY: number; startPanXNorm: number; startPanYNorm: number }

// 指定した比率・枠幅のもとで、枠の内側（写真が入る領域）のピクセルサイズを求める。
// 「キャンバス全体が指定比率どおり」になるよう、画像側ではなくこの内側領域のサイズを起点に組み立てる。
// 上下左右の枠幅が異なっていてもよい。
function computeContentSize(image: HTMLImageElement, frame: FrameSides, targetRatio: number | null) {
  const padH = frame.left + frame.right
  const padV = frame.top + frame.bottom

  if (targetRatio === null) {
    return { contentWidth: image.width, contentHeight: image.height }
  }

  let contentHeight = image.height
  let canvasHeight = contentHeight + padV
  let canvasWidth = targetRatio * canvasHeight
  let contentWidth = canvasWidth - padH

  if (contentWidth > image.width) {
    contentWidth = image.width
    canvasWidth = contentWidth + padH
    canvasHeight = canvasWidth / targetRatio
    contentHeight = canvasHeight - padV
  }

  return { contentWidth, contentHeight }
}

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [frameColor, setFrameColor] = useState('#ffffff')
  const [frameMode, setFrameMode] = useState<FrameMode>('uniform')
  const [frameWidth, setFrameWidth] = useState(40)
  const [frameTop, setFrameTop] = useState(40)
  const [frameBottom, setFrameBottom] = useState(120)
  const [frameSide, setFrameSide] = useState(40)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [aspectRatioKey, setAspectRatioKey] = useState<AspectRatioKey>('square')
  const [zoom, setZoom] = useState(1)
  const [panXNorm, setPanXNorm] = useState(0.5)
  const [panYNorm, setPanYNorm] = useState(0.5)
  const [texts, setTexts] = useState<TextLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isDraggingText, setIsDraggingText] = useState(false)
  const [guideLines, setGuideLines] = useState({ x: false, y: false })
  const [fontsLoadedTick, setFontsLoadedTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const frame: FrameSides =
    frameMode === 'uniform'
      ? { top: frameWidth, bottom: frameWidth, left: frameWidth, right: frameWidth }
      : { top: frameTop, bottom: frameBottom, left: frameSide, right: frameSide }

  const liveRef = useRef({ frame, aspectRatioKey, zoom, image })
  liveRef.current = { frame, aspectRatioKey, zoom, image }

  const selectedText = texts.find((t) => t.id === selectedId) ?? null

  const handleSetFrameMode = (mode: FrameMode) => {
    if (mode === 'custom' && frameMode === 'uniform') {
      setFrameTop(frameWidth)
      setFrameBottom(frameWidth)
      setFrameSide(frameWidth)
    }
    setFrameMode(mode)
  }

  const applyFramePreset = (px: number) => {
    if (frameMode === 'uniform') {
      setFrameWidth(px)
    } else {
      setFrameTop(px)
      setFrameBottom(px)
      setFrameSide(px)
    }
  }

  // Googleフォントは実際に使うまでダウンロードされないことがあるため、
  // 選択肢にあるフォントをあらかじめ読み込ませておき、読み込み完了時に再描画する。
  useEffect(() => {
    FONT_OPTIONS.forEach(({ family }) => {
      document.fonts.load(`700 48px ${family}`).then(() => setFontsLoadedTick((t) => t + 1))
    })
  }, [])

  const loadFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    loadFile(e.target.files?.[0])
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDropActive(false)
    loadFile(e.dataTransfer.files?.[0])
  }

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDropActive(true)
  }

  const handleDragLeave = () => setDropActive(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const targetRatio = ASPECT_RATIOS[aspectRatioKey].ratio
    const { contentWidth, contentHeight } = computeContentSize(image, frame, targetRatio)

    const canvasWidth = contentWidth + frame.left + frame.right
    const canvasHeight = contentHeight + frame.top + frame.bottom

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
    ctx.rect(frame.left, frame.top, contentWidth, contentHeight)
    ctx.clip()
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
    ctx.drawImage(
      image,
      0,
      0,
      image.width,
      image.height,
      frame.left + panX,
      frame.top + panY,
      displayedWidth,
      displayedHeight,
    )
    ctx.filter = 'none'
    ctx.restore()

    for (const text of texts) {
      ctx.font = `bold ${text.fontSize}px ${text.fontFamily}`
      ctx.fillStyle = text.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text.content, text.x, text.y)

      if (text.id === selectedId) {
        const metrics = ctx.measureText(text.content)
        const padding = 8
        ctx.save()
        ctx.strokeStyle = '#b06a45'
        ctx.setLineDash([6, 4])
        ctx.lineWidth = 1.5
        ctx.strokeRect(
          text.x - metrics.width / 2 - padding,
          text.y - text.fontSize / 2 - padding,
          metrics.width + padding * 2,
          text.fontSize + padding * 2,
        )
        ctx.restore()
      }
    }

    if (isDraggingText) {
      ctx.save()
      ctx.strokeStyle = '#ff3b8d'
      ctx.lineWidth = 1
      if (guideLines.x) {
        ctx.beginPath()
        ctx.moveTo(canvasWidth / 2, 0)
        ctx.lineTo(canvasWidth / 2, canvasHeight)
        ctx.stroke()
      }
      if (guideLines.y) {
        ctx.beginPath()
        ctx.moveTo(0, canvasHeight / 2)
        ctx.lineTo(canvasWidth, canvasHeight / 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [
    image,
    frameColor,
    frame,
    brightness,
    contrast,
    saturation,
    aspectRatioKey,
    zoom,
    panXNorm,
    panYNorm,
    texts,
    selectedId,
    isDraggingText,
    guideLines,
    fontsLoadedTick,
  ])

  const getPointFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => getPointFromClient(e.clientX, e.clientY)

  const hitTestText = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return null

    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i]
      ctx.font = `bold ${text.fontSize}px ${text.fontFamily}`
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

  const startDrag = (clientX: number, clientY: number) => {
    const point = getPointFromClient(clientX, clientY)
    const hit = hitTestText(point.x, point.y)

    if (hit) {
      setSelectedId(hit.id)
      setIsDraggingText(true)
      dragRef.current = { kind: 'text', id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y }
      return
    }

    setSelectedId(null)
    if (liveRef.current.image) {
      dragRef.current = { kind: 'image', startX: point.x, startY: point.y, startPanXNorm: panXNorm, startPanYNorm: panYNorm }
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    startDrag(e.clientX, e.clientY)
  }

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0]
    if (!touch) return
    startDrag(touch.clientX, touch.clientY)
  }

  useEffect(() => {
    const processMove = (clientX: number, clientY: number) => {
      const drag = dragRef.current
      const canvas = canvasRef.current
      if (!drag || !canvas) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const x = (clientX - rect.left) * scaleX
      const y = (clientY - rect.top) * scaleY

      if (drag.kind === 'text') {
        let nextX = x - drag.offsetX
        let nextY = y - drag.offsetY
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const snapX = Math.abs(nextX - centerX) < CENTER_SNAP_THRESHOLD
        const snapY = Math.abs(nextY - centerY) < CENTER_SNAP_THRESHOLD
        if (snapX) nextX = centerX
        if (snapY) nextY = centerY
        setGuideLines({ x: snapX, y: snapY })

        setTexts((prev) => prev.map((t) => (t.id === drag.id ? { ...t, x: nextX, y: nextY } : t)))
        return
      }

      const { frame, aspectRatioKey, zoom, image } = liveRef.current
      if (!image) return

      const targetRatio = ASPECT_RATIOS[aspectRatioKey].ratio
      const { contentWidth, contentHeight } = computeContentSize(image, frame, targetRatio)
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

    const handleMouseMove = (e: MouseEvent) => processMove(e.clientX, e.clientY)

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch || !dragRef.current) return
      e.preventDefault()
      processMove(touch.clientX, touch.clientY)
    }

    const handleDragEnd = () => {
      dragRef.current = null
      setIsDraggingText(false)
      setGuideLines({ x: false, y: false })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleDragEnd)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleDragEnd)
    window.addEventListener('touchcancel', handleDragEnd)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleDragEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleDragEnd)
      window.removeEventListener('touchcancel', handleDragEnd)
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
      fontFamily: FONT_OPTIONS[0].family,
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

    canvas.toBlob(async (blob) => {
      if (!blob) return

      // iOSのSafariは<a download>を無視するため、Web Share APIで
      // 共有シートから「写真に保存」できるようにする（対応環境のみ）。
      const file = new File([blob], 'framed-image.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
      if (nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] })
          return
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = 'framed-image.png'
      link.href = url
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Instagram用 枠つけエディタ</h1>
        <p>枠・フィルター・テキスト・投稿サイズをその場でプレビューしながら編集</p>
      </header>

      <div className="editor-layout">
        <div
          className={[
            'sidebar',
            image ? 'sidebar--collapsible' : '',
            mobileMenuOpen ? 'sidebar--open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false)
          }}
        >
          <button type="button" className="sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="メニューを閉じる">
            ✕
          </button>

          <div className="panel panel--upload">
            <label
              className={dropActive ? 'upload-dropzone drop-active' : 'upload-dropzone'}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b06a45" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              <span>{image ? '画像を変更' : '画像を選択'}</span>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>

          {image && (
            <>
              <div className="panel">
                <div className="panel-title" style={{ '--dot': '#b06a45' } as React.CSSProperties}>
                  枠・サイズ
                </div>
                <div className="field-grid">
                  <div className="color-row">
                    {COLOR_PRESETS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className="color-swatch"
                        style={{ background: hex }}
                        onClick={() => setFrameColor(hex)}
                        aria-label={`枠の色を${hex}にする`}
                      />
                    ))}
                    <input
                      type="color"
                      value={frameColor}
                      onChange={(e) => setFrameColor(e.target.value)}
                      aria-label="枠の色（カスタム）"
                    />
                  </div>

                  <div className="field" style={{ flexBasis: '100%' }}>
                    枠の設定方法
                    <div className="pill-row">
                      <button
                        type="button"
                        className={frameMode === 'uniform' ? 'pill active' : 'pill'}
                        onClick={() => handleSetFrameMode('uniform')}
                      >
                        均等
                      </button>
                      <button
                        type="button"
                        className={frameMode === 'custom' ? 'pill active' : 'pill'}
                        onClick={() => handleSetFrameMode('custom')}
                      >
                        上下カスタム
                      </button>
                    </div>
                  </div>

                  <div className="field" style={{ flexBasis: '100%' }}>
                    プリセット
                    <div className="pill-row">
                      {FRAME_PRESETS.map(({ label, px }) => (
                        <button
                          key={label}
                          type="button"
                          className="pill"
                          onClick={() => applyFramePreset(px)}
                        >
                          {label}（{px}px）
                        </button>
                      ))}
                    </div>
                  </div>

                  {frameMode === 'uniform' ? (
                    <label className="field">
                      枠の太さ（px）
                      <div className="slider-row">
                        <input
                          type="range"
                          min={0}
                          max={500}
                          value={frameWidth}
                          onChange={(e) => setFrameWidth(Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="number-input"
                          min={0}
                          max={500}
                          value={frameWidth}
                          onChange={(e) => setFrameWidth(Number(e.target.value))}
                        />
                      </div>
                    </label>
                  ) : (
                    <>
                      <label className="field">
                        上（px）
                        <div className="slider-row">
                          <input
                            type="range"
                            min={0}
                            max={500}
                            value={frameTop}
                            onChange={(e) => setFrameTop(Number(e.target.value))}
                          />
                          <input
                            type="number"
                            className="number-input"
                            min={0}
                            max={500}
                            value={frameTop}
                            onChange={(e) => setFrameTop(Number(e.target.value))}
                          />
                        </div>
                      </label>

                      <label className="field">
                        下（px）
                        <div className="slider-row">
                          <input
                            type="range"
                            min={0}
                            max={700}
                            value={frameBottom}
                            onChange={(e) => setFrameBottom(Number(e.target.value))}
                          />
                          <input
                            type="number"
                            className="number-input"
                            min={0}
                            max={700}
                            value={frameBottom}
                            onChange={(e) => setFrameBottom(Number(e.target.value))}
                          />
                        </div>
                      </label>

                      <label className="field">
                        左右（px）
                        <div className="slider-row">
                          <input
                            type="range"
                            min={0}
                            max={500}
                            value={frameSide}
                            onChange={(e) => setFrameSide(Number(e.target.value))}
                          />
                          <input
                            type="number"
                            className="number-input"
                            min={0}
                            max={500}
                            value={frameSide}
                            onChange={(e) => setFrameSide(Number(e.target.value))}
                          />
                        </div>
                      </label>
                    </>
                  )}

                  <div className="field" style={{ flexBasis: '100%' }}>
                    投稿サイズ
                    <div className="pill-row">
                      {Object.entries(ASPECT_RATIOS).map(([key, { label }]) => (
                        <button
                          key={key}
                          type="button"
                          className={aspectRatioKey === key ? 'pill active' : 'pill'}
                          onClick={() => setAspectRatioKey(key as AspectRatioKey)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

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
                <div className="panel-title" style={{ '--dot': '#7d8a5c' } as React.CSSProperties}>
                  フィルター・色調補正
                </div>
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
                <div className="panel-title" style={{ '--dot': '#b06a45' } as React.CSSProperties}>
                  テキスト
                </div>
                <button className="btn-dashed" onClick={handleAddText}>
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

                    <div className="field">
                      フォント
                      <div className="pill-row">
                        {FONT_OPTIONS.map(({ key, label, family }) => (
                          <button
                            key={key}
                            type="button"
                            className={selectedText.fontFamily === family ? 'pill active' : 'pill'}
                            style={{ fontFamily: family }}
                            onClick={() => updateSelectedText({ fontFamily: family })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

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

                    <div className="text-color-row">
                      文字色
                      <input
                        type="color"
                        value={selectedText.color}
                        onChange={(e) => updateSelectedText({ color: e.target.value })}
                      />
                    </div>

                    <button className="btn-danger" onClick={handleDeleteSelected}>
                      このテキストを削除
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="preview-column">
          <div className="preview-pane">
            {image && (
              <button type="button" className="mobile-edit-toggle" onClick={() => setMobileMenuOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                編集
              </button>
            )}
            {image ? (
              <canvas
                ref={canvasRef}
                className="preview-canvas"
                onMouseDown={handleCanvasMouseDown}
                onTouchStart={handleCanvasTouchStart}
              />
            ) : (
              <p className="placeholder">
                <span className="placeholder-icon">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#a89a82" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="16" rx="3" />
                    <circle cx="8.5" cy="9.5" r="1.5" />
                    <path d="M21 16l-5-5-4 4-3-3-4 4" />
                  </svg>
                </span>
                画像をアップロードすると
                <br />
                ここにプレビューが表示されます
              </p>
            )}
          </div>

          {image && (
            <button className="btn-primary" onClick={handleDownload}>
              ダウンロード
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
