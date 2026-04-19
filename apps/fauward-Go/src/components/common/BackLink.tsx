import { Link } from "react-router-dom";

type BackLinkProps = {
  to: string;
  label?: string;
};

export const BackLink = ({ to, label = "Back" }: BackLinkProps) => (
  <Link to={to} className="secondary-btn mb-4 inline-flex gap-2 px-3 py-2 text-xs">
    <span aria-hidden="true">&larr;</span>
    <span>{label}</span>
  </Link>
);
