import { Link } from "react-router-dom";

export const NotFoundScreen = () => (
  <section className="panel p-5">
    <p className="eyebrow">Not found</p>
    <h1 className="mt-2 text-2xl font-semibold text-ink">This field view does not exist.</h1>
    <p className="mt-3 text-sm leading-6 text-stone-600">
      Return to assigned jobs and reopen the job from the live list.
    </p>
    <Link to="/" className="primary-btn mt-5">
      Back home
    </Link>
  </section>
);
