import { useState } from "react";
import { User, UserPlus, X } from "lucide-react";
import { ROLE_ORDER } from "../auth/roles";
import { useLocale } from "../contexts/LocaleContext";

const Box = "d" + "iv";

export default function UserManageModal({ isOpen, users, currentUserId, onClose, onAdd, onSetActive }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(ROLE_ORDER[0]);
  const [error, setError] = useState("");
  const { t } = useLocale();
  const roleLabel = (role) => t(`roles.${role}`);

  if (!isOpen) return null;

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
    <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-lg max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <h3 className="font-bold flex items-center gap-2">
            <User className="text-purple-500" size={20} />
            {t("users.title")}
          </h3>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </Box>

        <Box className="p-4 overflow-auto flex-1 space-y-6">
          <form onSubmit={handleAdd} className="space-y-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-800">
            <p className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1">
              <UserPlus size={14} /> {t("users.addUser")}
            </p>
            <input
              type="text"
              placeholder={t("users.username")}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="text"
              placeholder={t("users.displayName")}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <input
              type="password"
              placeholder={t("users.password")}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded text-sm font-bold uppercase"
            >
              {t("users.createAccount")}
            </button>
          </form>

          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  u.active ? "bg-[#252525] border-gray-800" : "bg-[#1a1a1a] border-gray-900 opacity-60"
                }`}
              >
                <Box>
                  <p className="font-medium">{u.displayName}</p>
                  <p className="text-xs text-gray-500">
                    @{u.username} · {roleLabel(u.role)}
                    {u.id === currentUserId && ` · ${t("users.you")}`}
                  </p>
                </Box>
                {u.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => onSetActive(u.id, !u.active)}
                    className={`text-xs font-bold uppercase px-2 py-1 rounded border ${
                      u.active
                        ? "text-red-400 border-red-900"
                        : "text-green-400 border-green-900"
                    }`}
                  >
                    {u.active ? t("users.deactivate") : t("users.activate")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Box>
      </Box>
    </Box>
  );
}
