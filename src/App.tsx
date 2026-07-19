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

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [frameColor, setFrameColor] = useState('#ffffff')
  const [frameWidth, setFrameWidth] = useState(40)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [texts, setTexts] = useState<TextLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  const selectedText = texts.find((t) => t.id === selectedId) ?? null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => setImage(img)
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = image.width + frameWidth * 2
    canvas.height = image.height + frameWidth * 2

    ctx.fillStyle = frameColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
    ctx.drawImage(image, frameWidth, frameWidth, image.width, image.height)
    ctx.filter = 'none'

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
  }, [image, frameColor, frameWidth, brightness, contrast, saturation, texts, selectedId])

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
      dragRef.current = { id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y }
    } else {
      setSelectedId(null)
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
      const x = (e.clientX - rect.left) * scaleX - drag.offsetX
      const y = (e.clientY - rect.top) * scaleY - drag.offsetY

      setTexts((prev) => prev.map((t) => (t.id === drag.id ? { ...t, x, y } : t)))
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
    <div className="app">
      <h1>Instagram用 枠つけエディタ</h1>

      <div className="controls">
        <label className="upload-button">
          画像を選択
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>

        {image && (
          <>
            <label>
              枠の色
              <input
                type="color"
                value={frameColor}
                onChange={(e) => setFrameColor(e.target.value)}
              />
            </label>

            <label>
              枠の太さ（{frameWidth}px）
              <input
                type="range"
                min={0}
                max={150}
                value={frameWidth}
                onChange={(e) => setFrameWidth(Number(e.target.value))}
              />
            </label>

            <button onClick={handleDownload}>ダウンロード</button>
          </>
        )}
      </div>

      {image && (
        <div className="controls">
          <label>
            明るさ（{brightness}%）
            <input
              type="range"
              min={50}
              max={150}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
            />
          </label>

          <label>
            コントラスト（{contrast}%）
            <input
              type="range"
              min={50}
              max={150}
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
            />
          </label>

          <label>
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
      )}

      {image && (
        <div className="controls">
          <button onClick={handleAddText}>テキストを追加</button>

          {selectedText && (
            <>
              <label>
                内容
                <input
                  type="text"
                  value={selectedText.content}
                  onChange={(e) => updateSelectedText({ content: e.target.value })}
                />
              </label>

              <label>
                文字サイズ（{selectedText.fontSize}px）
                <input
                  type="range"
                  min={16}
                  max={120}
                  value={selectedText.fontSize}
                  onChange={(e) => updateSelectedText({ fontSize: Number(e.target.value) })}
                />
              </label>

              <label>
                文字色
                <input
                  type="color"
                  value={selectedText.color}
                  onChange={(e) => updateSelectedText({ color: e.target.value })}
                />
              </label>

              <button onClick={handleDeleteSelected}>このテキストを削除</button>
            </>
          )}
        </div>
      )}

      <div className="preview">
        {image ? (
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            onMouseDown={handleCanvasMouseDown}
          />
        ) : (
          <p className="placeholder">画像をアップロードするとここにプレビューが表示されます</p>
        )}
      </div>
    </div>
  )
}

export default App
