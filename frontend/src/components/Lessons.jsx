import { useEffect, useState } from 'react'
import { api } from '../api'

// Lesson list → slide player → quiz, awarding coins along the way.
export default function Lessons({ child, onCoins }) {
  const [lessons, setLessons] = useState([])
  const [active, setActive] = useState(null) // full lesson being viewed
  const [slideIdx, setSlideIdx] = useState(0)
  const [message, setMessage] = useState('')

  useEffect(() => { api.listLessons().then(setLessons).catch(() => {}) }, [])

  async function open(id) {
    const lesson = await api.getLesson(id)
    setActive(lesson); setSlideIdx(0); setMessage('')
  }

  async function finishLesson() {
    const res = await api.completeLesson(active.id, child.id)
    onCoins(res.coins)
    setMessage(res.coins_awarded > 0 ? `🎉 +${res.coins_awarded} coins!` : 'Already completed ✅')
    setActive(null)
  }

  if (active) {
    const slide = active.slides[slideIdx]
    const last = slideIdx === active.slides.length - 1
    return (
      <div className="stack">
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setActive(null)}>← Back</button>
        <div className="slide">
          <div className="pill-badge" style={{ alignSelf: 'flex-start' }}>
            Slide {slideIdx + 1} / {active.slides.length}
          </div>
          <h2>{slide?.title || active.title}</h2>
          {slide?.image_path && <img src={`/api/${slide.image_path}`} alt="" style={{ maxWidth: '100%', borderRadius: 12 }} />}
          <p>{slide?.body}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" disabled={slideIdx === 0} onClick={() => setSlideIdx(i => i - 1)}>Previous</button>
          {!last && <button className="btn btn-primary" onClick={() => setSlideIdx(i => i + 1)}>Next</button>}
          {last && <button className="btn btn-yellow" onClick={finishLesson}>Finish & earn coins</button>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="section-title">Lessons 📚</h2>
      {message && <p style={{ fontWeight: 800, color: 'var(--f4l-blue-dark)' }}>{message}</p>}
      {lessons.length === 0 ? (
        <div className="empty">
          No lessons yet. Import your PowerPoint decks on the backend:<br />
          <code>python -m app.pptx_importer "deck.pptx" --title "Saving Basics"</code>
        </div>
      ) : (
        <div className="grid">
          {lessons.map(l => (
            <div className="card" key={l.id}>
              <span className="pill-badge" style={{ alignSelf: 'flex-start' }}>{l.age_band}</span>
              <h3>{l.title}</h3>
              <button className="btn btn-primary" onClick={() => open(l.id)}>Start</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

