import { useEffect } from 'react';
import { useApp } from './state/app';
import { href, useRoute } from './state/router';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { SongScreen } from './screens/SongScreen';
import { Editor } from './screens/Editor';
import { Patterns, PatternEditor } from './screens/Patterns';
import { Settings } from './screens/Settings';
import { NotFound } from './screens/NotFound';
import { Toasts } from './ui/toast';
import { IconHome, IconLibrary, IconPattern, IconPlus, IconSettings } from './ui/icons';

export function App() {
  const { prefs } = useApp();
  const route = useRoute();
  const [root, id] = route.path;

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', prefs.theme === 'dark' ? '#0d0f13' : '#f5f6f8');
  }, [prefs.theme]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [root, id]);

  let screen: React.ReactNode;
  let tab: string | null = null;
  switch (root ?? '') {
    case '':
      screen = <Home />;
      tab = 'home';
      break;
    case 'library':
      screen = <Library query={route.query} />;
      tab = 'library';
      break;
    case 'song':
      screen = id ? <SongScreen id={id} initialView={route.query.get('view')} /> : <NotFound what="song" />;
      break;
    case 'edit':
      screen = <Editor id={id ?? 'new'} query={route.query} />;
      tab = id === 'new' || !id ? 'create' : null;
      break;
    case 'patterns':
      screen = id ? <PatternEditor id={id} query={route.query} /> : <Patterns />;
      tab = 'patterns';
      break;
    case 'settings':
      screen = <Settings />;
      tab = 'settings';
      break;
    default:
      screen = <NotFound />;
  }
  // The learning screen has its own bottom transport bar instead of the tab bar.
  const showTabs = root !== 'song';

  return (
    <div className={`app${showTabs ? ' with-tabs' : ''}`}>
      <div id="main">{screen}</div>
      {showTabs && (
        <nav className="tabbar" aria-label="Main">
          <a href={href('/')} className={tab === 'home' ? 'on' : ''} aria-current={tab === 'home' ? 'page' : undefined}>
            <IconHome />
            <span>Home</span>
          </a>
          <a href={href('/library')} className={tab === 'library' ? 'on' : ''} aria-current={tab === 'library' ? 'page' : undefined}>
            <IconLibrary />
            <span>Library</span>
          </a>
          <a href={href('/edit/new')} className={tab === 'create' ? 'on' : ''} aria-current={tab === 'create' ? 'page' : undefined}>
            <IconPlus />
            <span>Create</span>
          </a>
          <a href={href('/patterns')} className={tab === 'patterns' ? 'on' : ''} aria-current={tab === 'patterns' ? 'page' : undefined}>
            <IconPattern />
            <span>Strums</span>
          </a>
          <a href={href('/settings')} className={tab === 'settings' ? 'on' : ''} aria-current={tab === 'settings' ? 'page' : undefined}>
            <IconSettings />
            <span>Settings</span>
          </a>
        </nav>
      )}
      <Toasts />
    </div>
  );
}
