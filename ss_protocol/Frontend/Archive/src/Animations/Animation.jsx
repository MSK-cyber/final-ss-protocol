const DotAnimation = () => {
  return (
    <>
      <style>
        {`
          @keyframes blink {
            50% {
              opacity: 0;
            }
          }

          .dot {
            display: inline-block;
            font-size: 24px;
            color: #6c757d; /* Bootstrap's muted text color */
          }

          .animate-blink1 {
            animation: blink 1s infinite;
          }

          .animate-blink2 {
            animation: blink 1s 0.2s infinite; /* delay second dot */
          }

          .animate-blink3 {
            animation: blink 1s 0.4s infinite; /* delay third dot */
          }

          .animate-blink4 {
            animation: blink 1s 0.6s infinite; /* delay fourth dot */
          }
        `}
      </style>

      <span className="dot animate-blink1">•</span>
      <span className="dot animate-blink2">•</span>
      <span className="dot animate-blink3">•</span>
      <span className="dot animate-blink4">•</span>
    </>
  );
};

export default DotAnimation;
