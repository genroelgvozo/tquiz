export function Logo({ url }: { url: string | null }) {
  return <div className="logo">{url && <img src={url} alt="" />}</div>;
}
