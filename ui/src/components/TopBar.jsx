export default function TopBar() {
  return (
    <header className="topbar" role="banner">
      <div className="topbar__brand" aria-label="Zillow">
        <img
          src="https://www.zillowstatic.com/s3/pfs/static/z-logo-default.svg"
          alt="Zillow"
        />
      </div>
    </header>
  );
}
