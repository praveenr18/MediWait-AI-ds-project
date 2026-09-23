import React, { useState } from 'react';
import { X, Star, HeartHandshake } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function FeedbackModal({ isOpen, onClose, queueEntry, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit({
        queue_id: queueEntry?.id || 1,
        rating,
        comments
      });
    }
    setSubmitted(true);
    try {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
    } catch {}
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 text-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-sky-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HeartHandshake className="w-5 h-5" />
            <h3 className="text-base font-bold">Patient Experience Feedback</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Star className="w-6 h-6 fill-current" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Thank You for Your Feedback!</h4>
            <p className="text-xs text-slate-500">
              Your feedback directly assists MediWait AI in improving hospital operations and waiting accuracy.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Token {queueEntry?.token_number || "A-127"} • {queueEntry?.department_name || "Cardiology"}
              </p>
              <h4 className="text-sm font-bold text-slate-800 mt-1">
                How was your hospital waiting experience today?
              </h4>
            </div>

            {/* Star Rating */}
            <div className="flex justify-center items-center space-x-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      (hoverRating || rating) >= star
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 text-left mb-1">
                Comments or Suggestions
              </label>
              <textarea
                rows="3"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Share your thoughts on queue communication, doctor consultation, or wait time accuracy..."
                className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
              ></textarea>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Skip
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs"
              >
                Submit Feedback
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
