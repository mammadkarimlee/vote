type InfoTipProps = {
  text: string
}

export const InfoTip = ({ text }: InfoTipProps) => (
  <span className="info-tip" data-tip={text} aria-label={text} role="img">
    i
  </span>
)
