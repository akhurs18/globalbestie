// Placeholder product visual until real photos are added.
export default function Art({ art = 'holo', className = '', label, orb = true, children }) {
  return (
    <div className={`art art--${art} ${className}`}>
      {orb && <span className="art__orb" aria-hidden="true" />}
      {label && <span className="art__label">{label}</span>}
      {children}
    </div>
  );
}
