function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/70 bg-white/75 backdrop-blur-md mt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.14em] uppercase text-primary">Splitora</p>
          <p className="text-[0.95rem] text-muted-foreground mt-1">Smart expense operations for modern teams and friends.</p>
        </div>
        <div className="text-[0.9rem] text-muted-foreground">
          © {year} Splitora. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default Footer;
