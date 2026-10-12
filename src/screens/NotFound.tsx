import { navigate } from '../state/router';

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <div className="screen empty-state">
      <h1>That {what} isn’t here</h1>
      <p className="muted">It may have been deleted, or the link is from another device (your songs are stored on the device where you made them).</p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
        Go home
      </button>
    </div>
  );
}
