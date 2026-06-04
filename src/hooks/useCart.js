import { useCallback, useState } from "react";

export function useCart() {
  const [cart, setCart] = useState([]);

  const upsertLine = useCallback((line) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === line.id);
      if (existing) {
        return prev.map((item) => (item.id === line.id ? line : item));
      }
      return [...prev, line];
    });
  }, []);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }, []);

  const incrementQty = useCallback((id) => {
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: item.qty + 1 } : item))
    );
  }, []);

  const decrementQty = useCallback((id) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: item.qty - 1 } : item))
        .filter((item) => item.qty > 0)
    );
  }, []);

  const removeLine = useCallback((id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const setQty = useCallback((id, qty) => {
    const parsed = parseInt(qty, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: parsed } : item))
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const replaceCart = useCallback((nextCart) => setCart(nextCart), []);

  const removeProductFromCart = useCallback((productId) => {
    setCart((prev) =>
      prev.filter(
        (item) =>
          item.id !== productId &&
          !(item.allocations ?? []).some((allocation) => allocation.productId === productId)
      )
    );
  }, []);

  const totalUSD = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return {
    cart,
    upsertLine,
    addToCart,
    incrementQty,
    decrementQty,
    setQty,
    removeLine,
    clearCart,
    replaceCart,
    removeProductFromCart,
    totalUSD,
  };
}
