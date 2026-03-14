import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShoppingCart } from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/access', label: 'Access Management', icon: Users },
    { path: '/orders', label: 'Orders', icon: ShoppingCart },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Admin Portal</div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={20} className="sidebar-icon" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
