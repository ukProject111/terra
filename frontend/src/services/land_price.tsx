import { api } from "./baseapi";

class LandPricesAPIService{
    async getPredictedPrice (region: string, indicator: string, year: number) {
        try {
            const response = await api.get("/predict", {params: { region, indicator, year}
            });
            return response.data;
        } catch(err) {
            console.error("Error in api service: ", err)
        }
    }

    async getRegions (){
        try {
            const response = await api.get("/regions");
            return response.data;
        } catch(err) {
            console.error("Error in regions api:", err);
        }
    }

    async getIndicators (){
        try {
            const response = await api.get("/indicators");
            return response.data;
        } catch(err) {
            console.error("Error in indicators api:", err);
        }
    }

    async getIndicatorOptions () {
        try {
            const response = await api.get("options/indicators")
            return response.data
        } catch(err) {
            console.error("Error getting Indicator options:", err)
        }
    }

    async compareRegions (region1: string, region2: string, indicator: string, year: number){
        try {
            const response = await api.get("/compare", {
                params: {
                    region1,
                    region2,
                    indicator,
                    year
                }
            })
            return response.data;
        } catch(err){
            console.error(`Error comparing regions`, err)
        }
    }

    async getSidebarOptions (){
        try{
            const response = await api.get("/options/sidebar");
            return response.data;
        } catch(err) {
            console.error("ERROR getting sidebar options: ", err)
        }
    }

    async getPredictOptions(){
        try{
            const response = await api.get("/options/predict");
            return response.data;
        } catch(err){
            console.error("ERROR getting prediction options: ", err)
        }
    }

    async getTimeSeries(indicator: string, region?: string, maWindow: number = 3) {
    const response = await api.get("/analytics/timeseries", {
        params: { indicator, region, ma_window: maWindow }
    });
    return response.data;
    }

    async getOutliers(indicator: string) {
    const response = await api.get("/analytics/outliers", {
        params: { indicator }
    });
    return response.data;
    }

    async getCorrelation(indicators?: string[]) {
    const response = await api.get("/analytics/correlation", {
        params: { indicators } // axios sends repeated query keys for arrays
    });
    return response.data;
    }

    async getRegionStats(indicator?: string) {
    const response = await api.get("/analytics/stats/regions", {
        params: { indicator }
    });
    return response.data;
    }

    async getModelInfo() {
        try {
            const response = await api.get("/model/info");
            return response.data;
        } catch(err) {
            console.error("Error fetching model info:", err);
        }
    }
}

export const apiService = new LandPricesAPIService()