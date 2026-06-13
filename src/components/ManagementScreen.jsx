import SepelaModal from "./SepelaModal";

const Box = "d" + "iv";

export default function ManagementScreen({
  isOpen,
  onClose,
  title,
  icon,
  subtitle,
  children,
  footer,
  contentClassName = "",
  wide = false,
}) {
  return (
    <SepelaModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      subtitle={subtitle}
      portal
      fullscreen
      bodyClassName=""
    >
      <Box className="sepela-modal-body sepela-scroll flex-1 min-h-0">
        <Box className={`sepela-mgmt-content ${wide ? "sepela-mgmt-content--wide" : ""} ${contentClassName}`.trim()}>
          {children}
        </Box>
      </Box>
      {footer ? <Box className="sepela-modal-footer">{footer}</Box> : null}
    </SepelaModal>
  );
}
