import { useState } from "react";
import { User, UserPlus } from "lucide-react";
import { ROLE_ORDER } from "../auth/roles";
import { useLocale } from "../contexts/LocaleContext";
import ManagementScreen from "./ManagementScreen";

const Box = "d" + "iv";

export default function UserManageModal({ isOpen, users, currentUserId, onClose, onAdd, onSetActive }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(ROLE_ORDER[0]);
  const [error, setError] = useState("");
  const { t, tError } = useLocale();
  const roleLabel = (r) => t(`roles.${r}`);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    const result = await onAdd({ username, password, displayName, role });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsername("");
    setDisplayName("");
    setPassword("");
    setRole(ROLE_ORDER[0]);
  };

  return (
    <ManagementScreen
      isOpen={isOpen}
      onClose={onClose}
      title={t("users.title")}
      icon={User}
    >
      <Box className="space-y-6">
        <form onSubmit={handleAdd} className="sepela-panel space-y-3">
          <p className="sepela-section-title flex items-center gap-1">
            <UserPlus size={14} className="text-sepela-accent" /> {t("users.addUser")}
          </p>
          <input
            type="text"
            placeholder={t("users.username")}
            className="sepela-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="text"
            placeholder={t("users.displayName")}
            className="sepela-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            type="password"
            placeholder={t("users.password")}
            className="sepela-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <select className="sepela-input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          {error && <p className="text-red-400 text-xs font-semibold">{tError(error)}</p>}
          <button type="submit" className="sepela-btn-primary">
            {t("users.createAccount")}
          </button>
        </form>

        <ul className="space-y-1">
          {users.map((u) => (
            <li
              key={u.id}
              className={`sepela-list-item flex items-center justify-between gap-3 rounded-sm ${
                !u.active ? "opacity-60" : ""
              }`}
            >
              <Box>
                <p className="font-bold">{u.displayName}</p>
                <p className="text-xs text-sepela-muted font-semibold">
                  @{u.username} · {roleLabel(u.role)}
                  {u.id === currentUserId && ` · ${t("users.you")}`}
                </p>
              </Box>
              {u.id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => onSetActive(u.id, !u.active)}
                  className={`sepela-btn-secondary !w-auto text-[10px] ${
                    u.active ? "sepela-btn-danger" : ""
                  }`}
                >
                  {u.active ? t("users.deactivate") : t("users.activate")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Box>
    </ManagementScreen>
  );
}
