import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="notfound">
      <div className="aurora aurora--hero">
        <span />
        <span />
        <span />
      </div>
      <div style={{ position: 'relative' }}>
        <div className="notfound__code">404</div>
        <h1 className="h2" style={{ marginTop: 16 }}>That path is not in the rubric.</h1>
        <p className="lede" style={{ margin: '12px auto 26px', fontSize: '0.95rem' }}>
          The page you were looking for has moved, been archived, or never existed. The studio is still right here.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn--primary">
            <ArrowLeft size={15} /> Back to home
          </Link>
          <Link to="/careers" className="btn btn--ghost">
            <Compass size={15} /> Browse careers
          </Link>
        </div>
      </div>
    </div>
  );
}
