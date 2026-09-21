/**
 * AppShell.tsx — Shared Admin App chrome.
 * Top nav with role-appropriate links + main content area.
 * TODO: replace inline styles with CSS modules or Tailwind.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore, AdminRole } from '../../store/authStore';

const NAV_LINKS: Record<AdminRole, { label: string; to: string }[]> = {
  author:     [{ label: 'Recipes',    to: '/author/recipes'    }],
  instructor: [{ label: 'Modules',    to: '/instructor/modules' },
               { label: 'Validation', to: '/instructor/validation' }],
  researcher: [{ label: 'Data',       to: '/researcher/data'   },
               { label: 'Export',     to: '/researcher/export' }],
  admin:      [{ label: 'Modules',    to: '/admin/modules'     },
               { label: 'SAP Pool',   to: '/admin/sap-pool'    },
               { label: 'Audit Log',  to: '/admin/audit-log'   },
               { label: 'Health',     to: '/admin/health'      },
               { label: 'IRB',        to: '/admin/irb'         }],
};

interface Props { children: React.ReactNode; }

export function AppShell({ children }: Props) {
  const { role, email, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    clearAuth();
    navigate('/login');
  }

  const links = role ? NAV_LINKS[role] : [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: '#1D4E8C', color: '#fff', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 24, height: 52,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, marginRight: 16 }}>CAP Admin</span>
        {links.map(l => (
          <Link key={l.to} to={l.to}
            style={{ color: '#fff', textDecoration: 'none', fontSize: 14 }}>
            {l.label}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.8 }}>{email}</span>
        <button onClick={handleLogout}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
          Sign out
        </button>
      </nav>
      <main style={{ flex: 1, padding: 32, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {children}
      </main>
    </div>
  );
}
