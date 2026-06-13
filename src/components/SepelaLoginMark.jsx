/** Brand mark for login — hexagon outline with “S”, Aronium-inspired. */
export default function SepelaLoginMark({ size = 72 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="sepela-login__mark"
    >
      <path
        d="M36 6L62 21V51L36 66L10 51V21L36 6Z"
        stroke="#0091d5"
        strokeWidth="2.5"
        fill="none"
      />
      <text
        x="36"
        y="44"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="28"
        fontWeight="600"
        fontFamily="Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
      >
        S
      </text>
    </svg>
  );
}
