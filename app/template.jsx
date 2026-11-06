// Re-mounts on every navigation, so each page eases in.
export default function Template({ children }) {
  return <div className="page">{children}</div>;
}
