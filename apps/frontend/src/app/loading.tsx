export default function Loading() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="animate-pulse space-y-5">
          <div className="h-10 w-3/4 rounded-md bg-gray-100" />
          <div className="h-6 w-2/3 rounded-md bg-gray-100" />
          <div className="h-[360px] rounded-xl border border-gray-200 bg-gray-50" />
        </div>
      </div>
    </section>
  );
}
