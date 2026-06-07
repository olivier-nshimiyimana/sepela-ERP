import type { ReactNode } from "react";

type PortalPageProps = {
  variant?: "overview" | "data";
  head: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function PortalPage({
  variant = "data",
  head,
  filters,
  children,
  footer,
}: PortalPageProps) {
  const isOverview = variant === "overview";

  return (
    <div className={`portal-page${isOverview ? " portal-page--overview" : ""}`}>
      <div className="portal-page-head">{head}</div>
      {filters ? <div className="portal-page-filters">{filters}</div> : null}
      {isOverview ? (
        <div className="portal-page-overview-content">{children}</div>
      ) : (
        <div className="portal-page-body">{children}</div>
      )}
      {footer}
    </div>
  );
}
