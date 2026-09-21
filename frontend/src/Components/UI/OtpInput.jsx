import { useEffect, useRef, useState } from 'react';

// OTP input — beUI/Rare pattern: gliding slots, digit pop-in, error shake.
const OtpInput = ({ length = 6, value = '', onChange, onComplete, disabled = false, label = 'Verification code', errorSignal = 0 }) => {
  const [digits, setDigits] = useState(() => String(value).slice(0, length).split(''));
  const inputsRef = useRef([]);

  useEffect(() => {
    setDigits(String(value).slice(0, length).split(''));
  }, [value, length]);

  const commit = (next) => {
    setDigits(next);
    const code = next.join('');
    onChange?.(code);
    if (code.length === length && next.every((digit) => /[0-9]/.test(digit))) onComplete?.(code);
  };

  const focusAt = (index) => inputsRef.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const handleChange = (index, raw) => {
    const chars = String(raw).replace(/\D/g, '').slice(0, length - index).split('');
    if (!chars.length) return;
    const next = [...digits];
    chars.forEach((char, offset) => { next[index + offset] = char; });
    commit(next.slice(0, length));
    focusAt(Math.min(length - 1, index + chars.length));
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) next[index] = '';
      else if (index > 0) { next[index - 1] = ''; focusAt(index - 1); }
      commit(next);
    } else if (event.key === 'ArrowLeft') focusAt(index - 1);
    else if (event.key === 'ArrowRight') focusAt(index + 1);
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    commit(text.split(''));
    focusAt(text.length);
  };

  return (
    <div role="group" aria-label={label} className={errorSignal ? 'eb-shake' : ''} key={errorSignal}>
      <div className="eb-otp" onPaste={handlePaste}>
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(node) => { inputsRef.current[index] = node; }}
            value={digits[index] || ''}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            disabled={disabled}
            aria-label={`${label} digit ${index + 1}`}
            className={digits[index] ? 'filled' : ''}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
          />
        ))}
      </div>
    </div>
  );
};

export default OtpInput;
export { OtpInput };
