import { QRCodeSVG } from "qrcode.react";

export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <div className="qr" style={{ width: size + 24, height: size + 24 }}>
      <QRCodeSVG value={value} size={size} marginSize={0} />
    </div>
  );
}
