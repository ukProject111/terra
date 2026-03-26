import { AiOutlineStock } from "react-icons/ai";
// import { FaBalanceScale, FaChartLine, FaCompass, FaHistory, FaHome, FaQuestionCircle, FaSlidersH } from "react-icons/fa";
import { FaBalanceScale, FaChartLine, FaCompass, FaHome } from "react-icons/fa";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { apiService } from "../services/land_price";

const Sidebar = () => {
    const [apiOptions, setApiOptions] = useState<Record<string, string>>({});

    const navItems = [
        { label: "Predictor", icon: <AiOutlineStock />, to: "/predict" },
        { label: "Compare", icon: <FaBalanceScale />, to: "/compare" },
        { label: "Market Insights", icon: <FaChartLine />, to: "/analytics" },
        // { label: "Historical Data", icon: <FaHistory />, to: "/home" },
        // { label: "Settings", icon: <FaSlidersH />, to: "/home" },
    ];

    useEffect(() => {
        async function loadSidebarOptions() {
            try {
                const response = await apiService.getSidebarOptions();
                if (response && typeof response === "object") {
                    setApiOptions(response as Record<string, string>);
                }
            } catch (error) {
                console.error("Error loading sidebar options:", error);
            }
        }

        void loadSidebarOptions();
    }, []);

    const visibleNavItems = useMemo(() => {
        if (Object.keys(apiOptions).length === 0) {
            return navItems;
        }

        return navItems
            .map((item) => {
                const direct = apiOptions[item.label];
                if (direct) {
                    return { ...item, to: direct };
                }

                const alias = item.label === "Predictor" ? apiOptions.Prediction : undefined;
                if (alias) {
                    return { ...item, to: alias };
                }

                return item;
            })
            .filter((item) => {
                const acceptedLabels = [item.label, item.label === "Predictor" ? "Prediction" : ""];
                return acceptedLabels.some((label) => label && label in apiOptions);
            });
    }, [apiOptions]);

    return (
        <aside className="sidebar-shell">
            <div className="sidebar-brand">
                <div className="brand-icon">
                    <FaCompass />
                </div>
                <div>
                    <p className="brand-title">TerraSight | UK</p>
                    <p className="brand-subtitle">Land-Price Intelligence</p>
                </div>
            </div>
            <nav className="sidebar-nav">
                <NavLink to="/home" className={({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`}>
                    <FaHome />
                    <span>Dashboard</span>
                </NavLink>
                {visibleNavItems.map((item) => (
                    <NavLink key={item.label} to={item.to} className={({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`}>
                        {item.icon}
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
            {/* <div className="sidebar-help">
                <FaQuestionCircle />
                <span>Help</span>
            </div> */}
        </aside>
    );
};

export default Sidebar;