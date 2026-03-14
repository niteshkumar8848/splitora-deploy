import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="mt-12 border-t border-border/70 bg-white/70 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.16em] uppercase text-primary">Splitora</p>
          <p className="text-sm text-muted-foreground mt-1">Smart expense operations for modern teams and friends.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link className="text-muted-foreground hover:text-foreground transition-colors" to="/dashboard">
            Dashboard
          </Link>
          <Link className="text-muted-foreground hover:text-foreground transition-colors" to="/profile">
            Profile
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
