// modules/state.js
const StateModule = (() => {
    // Private state
    const state = {
      currentUser: null,
      currentPage: 'dashboard',
      serviceData: [],
      currentServiceId: null
    };
    
    // Public interface
    return {
      getState() {
        return state;
      },
      updateState(newState) {
        Object.assign(state, newState);
      }
    };
  })();
  
  // Export the functions
  export const getState = StateModule.getState;
  export const updateState = StateModule.updateState;