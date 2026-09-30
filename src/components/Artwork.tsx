import { useId } from 'react';
export default function Artwork({
  kind = 'landscape',
  className = '',
}: {
  kind?: string;
  className?: string;
}) {
  const uid = useId().replaceAll(':', '');
  const isCity = kind === 'Tokyo' || kind === 'Osaka' || kind === 'food';
  const isCoast = /art|Setouchi|Naoshima|Onomichi|Kurashiki|coast/.test(kind);
  return (
    <svg
      className={`artwork ${className}`}
      viewBox="0 0 640 440"
      role="img"
      aria-label={
        isCoast
          ? 'Illustration of a quiet Japanese island'
          : isCity
            ? 'Illustration of a Japanese neighbourhood'
            : 'Illustration of mountains and a temple in autumn'
      }
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${uid}sky`} x2="0" y2="1">
          <stop stopColor="#eae3d3" />
          <stop offset="1" stopColor="#f4ecdc" />
        </linearGradient>
        <filter id={`${uid}grain`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".7"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".065" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <g filter={`url(#${uid}grain)`}>
        <path fill={`url(#${uid}sky)`} d="M0 0h640v440H0z" />
        <circle cx={isCity ? 480 : 450} cy="111" r="57" fill="#cc6346" opacity=".9" />
        <path d="M-40 273L150 89l133 156 86-83 223 167 80 140H0z" fill="#a3ada0" />
        <path d="M70 167l80-78 68 81-42-17-25 15-25-13z" fill="#f7f2e7" />
        <path d="M-30 308l95-67 142 72 160-123 193 100 124-22v172H0z" fill="#708b7c" />
        <path d="M-10 348l108-45 127 25 149-37 120 38 169-35v146H0z" fill="#456b61" />
        {isCoast ? (
          <>
            <path d="M0 326Q110 286 219 329T440 315T660 334V440H0z" fill="#93b4b0" />
            <path
              d="M0 380q152-31 292 8t348-7"
              fill="none"
              stroke="#e8eee1"
              strokeWidth="3"
              opacity=".65"
            />
            <path d="M230 359q58-46 145 0z" fill="#365d54" />
            <path
              d="M452 280h8v98h-8zM425 291h64v9h-64zM418 278q39 7 78 0v10h-78z"
              fill="#bb503a"
            />
          </>
        ) : isCity ? (
          <>
            <path d="M57 224h102v178H57z" fill="#e4d2b0" />
            <path d="M53 224l59-35 56 35z" fill="#293f3c" />
            <path d="M168 268h103v151H168z" fill="#b36b4d" />
            <path d="M157 268l65-38 64 38z" fill="#304641" />
            <path d="M293 242h109v190H293z" fill="#d5be93" />
            <path d="M284 242l65-33 66 33z" fill="#263e3a" />
            {[79, 110, 185, 220, 312, 353].map((x, i) => (
              <g key={x}>
                <path d={`M${x} ${i < 2 ? 253 : 289}h19v29h-19z`} fill="#324b42" />
                <path d={`M${x} 344h19v45h-19z`} fill="#354f45" />
              </g>
            ))}
            <path d="M377 440l-91-60-146 60" fill="#c2b7a0" />
            <path d="M489 201v229" stroke="#344f47" strokeWidth="5" />
            <path d="M450 245h79" stroke="#344f47" strokeWidth="4" />
            <path d="M0 250Q296 298 640 209" fill="none" stroke="#344f47" strokeWidth="2" />
          </>
        ) : (
          <>
            <path d="M275 414q13-39 42-57t20-57" fill="none" stroke="#dacba6" strokeWidth="21" />
            <g transform="translate(412 212)">
              <path d="M-3 67h69v99H-3z" fill="#b75b3f" />
              <path d="M4 68h55v99H4z" fill="#ab573b" />
              <path
                d="M-24 70q56-11 56-28 0 17 58 28l-8 8H-18zM-16 32q48-10 48-26 0 16 51 26l-6 8h-85zM-9 1q42-10 42-24 0 14 42 24l-4 7H-4z"
                fill="#273f38"
              />
              <path d="M13 39h40v26H13zM20 8h26v22H20z" fill="#c2724e" />
              <path d="M20 128h24v38H20z" fill="#2e443b" />
              <path d="M33-30v-18" stroke="#273f38" strokeWidth="3" />
            </g>
          </>
        )}
        <path d="M38 440l33-195 17 1 20 194z" fill="#354b39" />
        <g fill="#bd693d">
          <circle cx="60" cy="231" r="54" />
          <circle cx="19" cy="263" r="55" />
          <circle cx="108" cy="263" r="40" />
          <circle cx="38" cy="303" r="38" />
        </g>
        <g fill="#d49b56">
          <circle cx="13" cy="223" r="31" />
          <circle cx="69" cy="210" r="28" />
          <circle cx="121" cy="252" r="21" />
        </g>
        <path d="M584 440l-8-135h10l14 135" fill="#394e39" />
        <g fill="#8d573e">
          <circle cx="581" cy="303" r="40" />
          <circle cx="624" cy="300" r="49" />
          <circle cx="603" cy="267" r="31" />
        </g>
        <path d="M0 421q110-19 228 19H0zM412 440q116-47 228-8v8z" fill="#294d42" />
        <g fill="#e3b066" opacity=".9">
          <ellipse cx="158" cy="387" rx="6" ry="2" transform="rotate(-24 158 387)" />
          <ellipse cx="358" cy="406" rx="5" ry="2" transform="rotate(27 358 406)" />
          <ellipse cx="188" cy="420" rx="7" ry="2" />
        </g>
      </g>
    </svg>
  );
}
