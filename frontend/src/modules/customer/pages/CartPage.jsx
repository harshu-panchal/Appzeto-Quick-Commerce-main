import React from 'react';
import { Link } from 'react-router-dom';
import Lottie from 'lottie-react';
import { useCart } from '../context/CartContext';
import {
    Minus,
    Plus,
    Trash2,
    ArrowRight,
    Sparkles,
    ShieldCheck,
    Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@shared/components/ui/Toast';
import emptyBoxAnimation from '../../../assets/lottie/Empty box.json';

const CartPage = () => {
    const { cart, removeFromCart, updateQuantity, cartTotal, clearCart } = useCart();
    const { showToast } = useToast();
    const itemCount = cart.reduce((count, item) => count + item.quantity, 0);

    const handleRemove = (id, name) => {
        removeFromCart(id);
        showToast(`${name} removed from cart`, 'info');
    };

    return (
        <div className="relative isolate w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(12,131,31,0.14),_transparent_34%),linear-gradient(180deg,_#f8faf9_0%,_#eef6f0_100%)] animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-16 -right-16 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />
                <div className="absolute top-24 left-[-5rem] h-56 w-56 rounded-full bg-lime-200/40 blur-3xl" />
                <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-white/60 blur-2xl" />
            </div>

            <div className="relative mx-auto w-full max-w-[1440px] px-4 md:px-8 lg:px-12 py-6 md:py-8 lg:py-10">
                {cart.length > 0 ? (
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
                        <section className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                                    Your items
                                </h2>
                                <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
                                    {itemCount} total
                                </span>
                            </div>

                            <div className="space-y-3">
                                {cart.map((item) => (
                                    <article
                                        key={item.id}
                                        className="group overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/85 backdrop-blur-sm shadow-[0_12px_35px_rgba(15,23,42,0.08)] transition-transform duration-300 hover:-translate-y-0.5"
                                    >
                                        <div className="flex gap-4 p-4 md:p-5">
                                            <div className="h-24 w-24 md:h-28 md:w-28 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                                                <img
                                                    src={item.image}
                                                    alt={item.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                                            {item.category}
                                                        </span>
                                                        <h3 className="mt-2 truncate text-lg md:text-xl font-black tracking-tight text-slate-900">
                                                            {item.name}
                                                        </h3>
                                                        <p className="mt-1 text-sm font-medium text-slate-500">
                                                            1 kg
                                                        </p>
                                                    </div>

                                                    <button
                                                        onClick={() => handleRemove(item.id, item.name)}
                                                        className="rounded-full border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:border-rose-200 hover:text-rose-500"
                                                        aria-label={`Remove ${item.name}`}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>

                                                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="flex items-end gap-2">
                                                        <div className="text-2xl font-black tracking-tight text-slate-900">
                                                            ₹{item.price * item.quantity}
                                                        </div>
                                                        <div className="pb-0.5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                                                            total
                                                        </div>
                                                    </div>

                                                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 shadow-sm">
                                                        <button
                                                            onClick={() => updateQuantity(item.id, -1)}
                                                            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-all hover:bg-white hover:text-slate-900 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-30"
                                                            disabled={item.quantity <= 1}
                                                        >
                                                            <Minus size={15} strokeWidth={3} />
                                                        </button>
                                                        <span className="min-w-[24px] text-center text-sm font-black text-slate-900">
                                                            {item.quantity}
                                                        </span>
                                                        <button
                                                            onClick={() => updateQuantity(item.id, 1)}
                                                            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-all hover:bg-white hover:text-slate-900 hover:shadow-md"
                                                        >
                                                            <Plus size={15} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
                                <Link
                                    to="/categories"
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                                >
                                    Continue Shopping
                                    <ArrowRight size={16} />
                                </Link>
                                <button
                                    onClick={clearCart}
                                    className="text-sm font-bold text-slate-400 transition-colors hover:text-rose-500"
                                >
                                    Clear Cart
                                </button>
                            </div>
                        </section>

                        <aside className="lg:sticky lg:top-28 h-fit">
                            <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-900 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                                <div className="bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.35),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.08),_transparent)] px-6 py-6">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
                                        <ShieldCheck size={13} />
                                        Secure summary
                                    </div>
                                    <h2 className="mt-3 text-2xl font-black tracking-tight">
                                        Order Summary
                                    </h2>
                                    <p className="mt-2 text-sm leading-relaxed text-white/70">
                                        One last look before we send it to checkout.
                                    </p>
                                </div>

                                <div className="space-y-4 px-6 pb-6">
                                    <div className="space-y-3 rounded-[1.5rem] bg-white/5 p-4 backdrop-blur-sm">
                                        <div className="flex justify-between text-sm text-white/75">
                                            <span>Subtotal</span>
                                            <span className="font-bold text-white">₹{cartTotal}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-white/75">
                                            <span>Delivery Fee</span>
                                            <span className="font-bold text-emerald-300">FREE</span>
                                        </div>
                                        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                                            <span className="text-base font-bold text-white/85">Total Amount</span>
                                            <span className="text-3xl font-black tracking-tight text-emerald-300">₹{cartTotal}</span>
                                        </div>
                                    </div>

                                    <Link to="/checkout" className="block">
                                        <Button className="h-14 w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-base font-black flex items-center justify-center gap-2 shadow-[0_18px_35px_rgba(16,185,129,0.3)] transition-all">
                                            Place Order <ArrowRight size={18} />
                                        </Button>
                                    </Link>

                                    <div className="grid grid-cols-2 gap-3 text-xs font-bold uppercase tracking-[0.16em] text-white/55">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                                            <Truck size={15} className="mb-2 text-emerald-300" />
                                            Fast delivery
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                                            <ShieldCheck size={15} className="mb-2 text-emerald-300" />
                                            Secure payment
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                ) : (
                    <div className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                        <div className="relative px-6 py-12 md:px-12 md:py-16">
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute -right-8 top-0 h-32 w-32 rounded-full bg-emerald-200/40 blur-3xl" />
                                <div className="absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-lime-200/50 blur-3xl" />
                            </div>

                            <div className="relative text-center">
                                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">
                                    <Sparkles size={12} />
                                    Empty cart
                                </div>

                                <div className="mx-auto mb-8 flex h-48 w-48 items-center justify-center rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white shadow-[0_16px_40px_rgba(16,185,129,0.12)] md:h-56 md:w-56">
                                    <Lottie
                                        animationData={emptyBoxAnimation}
                                        loop
                                        className="h-40 w-40 md:h-48 md:w-48"
                                    />
                                </div>

                                <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-[0.96]">
                                    Your cart is empty
                                </h2>
                                <p className="mx-auto mt-4 max-w-xl text-base md:text-lg leading-relaxed text-slate-600">
                                    Let&apos;s fill it with fresh essentials, daily favorites, and the little things you need right now.
                                </p>

                                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
                                    <Link
                                        to="/categories"
                                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-8 py-3.5 text-sm font-black text-white transition-transform hover:-translate-y-0.5"
                                    >
                                        Start Shopping
                                        <ArrowRight size={16} />
                                    </Link>
                                    <Link
                                        to="/offers"
                                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-3.5 text-sm font-black text-slate-800 transition-colors hover:bg-slate-50"
                                    >
                                        Browse Offers
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CartPage;
