import { useEffect, useRef, useState } from 'react'
import './App.css'

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [frameColor, setFrameColor] = useState('#ffffff')
  const [frameWidth, setFrameWidth] = useState(40)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
  }, [image, frameColor, frameWidth, brightness, contrast, saturation])

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

      <div className="preview">
        {image ? (
          <canvas ref={canvasRef} className="preview-canvas" />
        ) : (
          <p className="placeholder">画像をアップロードするとここにプレビューが表示されます</p>
        )}
      </div>
    </div>
  )
}

export default App
