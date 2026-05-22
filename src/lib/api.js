import { clearAuthData } from './auth.js';

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3000/api";

class ApiClient {
    
    async request(endpoint, method = "GET", bodyData = null) {
        const url = API_URL + endpoint;
        const headers = { "Content-Type": "application/json" };

        if (typeof window !== 'undefined') {
            const token = localStorage.getItem("token");
            if (token !== null) {
                headers["Authorization"] = "Bearer " + token;
            }
        }

        const config = {
            method: method,
            headers: headers
        };

        if (bodyData !== null) {
            config.body = JSON.stringify(bodyData);
        }

        const response = await fetch(url, config);
        
        let data = null;
        if (response.status !== 204) {
            data = await response.json();
        }

        if (response.ok === false) {
            if (response.status === 401 && typeof window !== "undefined") {
                clearAuthData();
                window.location.href = "/login";
            }
            let errorMsg = "Request error";
            if (data !== null && data.message) errorMsg = data.message;
            if (data !== null && data.error) errorMsg = data.error;
            if (data !== null && data.reason) errorMsg = data.reason;
            
            const error = new Error(errorMsg);
            error.status = response.status;
            error.data = data;
            error.url = url;
            throw error;
        }

        return data;
    }

    login = async (email, password) => {
        return await this.request("/auth/login", "POST", { email: email, password: password });
    }

    register = async (userData) => {
        return await this.request("/auth/register", "POST", userData);
    }

    updateProfile = async (data) => {
        return await this.request("/auth/users/update/profile", "PUT", data);
    }

    getUsers = async () => {
        return await this.request("/auth/users", "GET");
    }

    machines = {
        getAll: async () => await this.request("/machines", "GET"),
        create: async (data) => await this.request("/machines", "POST", data),
        update: async (id, data) => await this.request("/machines/" + id, "PUT", data),
        delete: async (id) => await this.request("/machines/" + id, "DELETE")
    }

     spareParts = {
        getAll: async () => await this.request("/spare-parts", "GET"),
        getLowStock: async () => await this.request("/spare-parts/stock/low", "GET"),
        create: async (data) => await this.request("/spare-parts", "POST", data),
        update: async (id, data) => await this.request("/spare-parts/" + id, "PUT", data),
        delete: async (id) => await this.request("/spare-parts/" + id, "DELETE")
    }

    workOrders = {
        getAll: async (filters = {}) => {
            let endpoint = "/work-orders";
            if (filters.status !== undefined || filters.search !== undefined) {
                const params = new URLSearchParams(filters);
                endpoint = endpoint + "?" + params.toString();
            }
            return await this.request(endpoint, "GET");
        },
        create: async (data) => await this.request("/work-orders", "POST", data),
        update: async (id, data) => await this.request("/work-orders/" + id, "PUT", data),
        start: async (id) => await this.request("/work-orders/" + id + "/start", "PUT"),
        close: async (id, data) => await this.request("/work-orders/" + id + "/close", "PUT", data),
        delete: async (id) => await this.request("/work-orders/" + id, "DELETE")
    }
}

export const api = new ApiClient();
export default api;