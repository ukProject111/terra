import { createContext, type ReactNode , useState} from "react";


export const AppContext = createContext<any>(null);

export const AppProvider = ({children}: {children: ReactNode}) => {
    const [data, setData] = useState({"sidebar": "This is data from the context provider"});

    return (
        <AppContext.Provider value={{data, setData}}>
            {children}
        </AppContext.Provider>
    )
}