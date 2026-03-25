import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MainLocationHeader from '../components/shared/MainLocationHeader';
import { customerApi } from '../services/customerApi';

const COLORS = [
    "#F2EEE4", "#EFE7E2", "#EAF1F4", "#F0E8F2",
    "#EAF4EC", "#F5F1E6", "#EEF2F6", "#F2EEF5"
];

const CategoriesPage = () => {
    const [groups, setGroups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [columnsPerRow, setColumnsPerRow] = useState(() => {
        if (typeof window === 'undefined') return 4;
        if (window.innerWidth >= 1024) return 8;
        if (window.innerWidth >= 768) return 6;
        return 4;
    });
    const [flippedCategoryId, setFlippedCategoryId] = useState(null);

    const fetchCategories = async () => {
        setIsLoading(true);
        try {
            const res = await customerApi.getCategories({ tree: true });
            if (res.data.success) {
                const tree = res.data.results || res.data.result || [];
                const formattedGroups = tree
                    .filter((header) => (header.name || '').trim().toLowerCase() !== 'all')
                    .map((header, idx) => ({
                    title: header.name,
                    categories: (header.children || []).map((cat, cIdx) => ({
                        id: cat._id,
                        name: cat.name,
                        image: cat.image || "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout-engine/2022-11/Slice-1_9.png",
                        color: COLORS[(idx + cIdx) % COLORS.length]
                    }))
                }));
                setGroups(formattedGroups);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        const updateColumnsPerRow = () => {
            if (window.innerWidth >= 1024) setColumnsPerRow(8);
            else if (window.innerWidth >= 768) setColumnsPerRow(6);
            else setColumnsPerRow(4);
        };
        updateColumnsPerRow();
        window.addEventListener('resize', updateColumnsPerRow);
        return () => window.removeEventListener('resize', updateColumnsPerRow);
    }, []);

    const flipRows = useMemo(() => {
        const rows = [];
        groups.forEach((group, groupIndex) => {
            const cats = group.categories || [];
            const isLeftToRightGroup = groupIndex % 2 === 0;
            for (let rowStart = 0; rowStart < cats.length; rowStart += columnsPerRow) {
                const row = cats.slice(rowStart, rowStart + columnsPerRow);
                const rowSequence = isLeftToRightGroup ? row : [...row].reverse();
                const rowIds = rowSequence.map((category) => category.id).filter(Boolean);
                if (rowIds.length) rows.push(rowIds);
            }
        });
        return rows;
    }, [groups, columnsPerRow]);

    useEffect(() => {
        if (!flipRows.length) {
            setFlippedCategoryId(null);
            return;
        }

        let isCancelled = false;
        let activeTimer = null;
        let settleTimer = null;
        let rowCursor = 0;
        const itemCursorByRow = new Array(flipRows.length).fill(0);

        const FLIP_VISIBLE_MS = 620;
        const GAP_BETWEEN_FLIPS_MS = 220;

        const getNextFromRows = () => {
            const totalRows = flipRows.length;
            for (let tries = 0; tries < totalRows; tries += 1) {
                const rowIndex = (rowCursor + tries) % totalRows;
                const rowItems = flipRows[rowIndex] || [];
                if (!rowItems.length) continue;
                const itemIndex = itemCursorByRow[rowIndex] % rowItems.length;
                const nextId = rowItems[itemIndex];
                itemCursorByRow[rowIndex] = (itemIndex + 1) % rowItems.length;
                rowCursor = (rowIndex + 1) % totalRows; // alternate to next row
                return nextId;
            }
            return null;
        };

        const scheduleNextFlip = () => {
            if (isCancelled) return;
            activeTimer = setTimeout(() => {
                if (isCancelled) return;
                const nextId = getNextFromRows();
                if (!nextId) return;
                setFlippedCategoryId(nextId);

                settleTimer = setTimeout(() => {
                    if (isCancelled) return;
                    setFlippedCategoryId(null);
                    scheduleNextFlip();
                }, FLIP_VISIBLE_MS);
            }, GAP_BETWEEN_FLIPS_MS);
        };

        scheduleNextFlip();

        return () => {
            isCancelled = true;
            if (activeTimer) clearTimeout(activeTimer);
            if (settleTimer) clearTimeout(settleTimer);
        };
    }, [flipRows]);

    return (
        <div className="min-h-screen bg-white">
            <MainLocationHeader />
            <div className="max-w-[1280px] mx-auto px-4 pt-[140px] md:pt-[150px] pb-20">
                {groups.map((group, groupIdx) => (
                    <div key={groupIdx} className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${groupIdx * 100}ms` }}>
                        {/* Group Title */}
                        <h2 className="text-xl md:text-2xl font-black text-[#1A1A1A] mb-6 px-1">
                            {group.title}
                        </h2>

                        {/* Categories Grid */}
                        <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-8">
                            {group.categories.map((category) => (
                                <div key={category.id} className="flex flex-col group cursor-pointer">
                                    <Link
                                        to={`/category/${category.id}`}
                                        className="block"
                                    >
                                        <div className="aspect-square mb-2 [perspective:1000px]">
                                            <div
                                                className="relative w-full h-full transition-transform duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] will-change-transform"
                                                style={{
                                                    transformStyle: 'preserve-3d',
                                                    WebkitTransformStyle: 'preserve-3d',
                                                    transform: flippedCategoryId === category.id ? 'rotateY(180deg)' : 'rotateY(0deg)'
                                                }}
                                            >
                                                <div
                                                    className="absolute inset-0 rounded-full p-2.5 flex items-center justify-center shadow-sm"
                                                    style={{
                                                        backgroundColor: category.color,
                                                        transform: 'rotateY(0deg)',
                                                        backfaceVisibility: 'hidden',
                                                        WebkitBackfaceVisibility: 'hidden'
                                                    }}
                                                >
                                                    <img
                                                        src={category.image}
                                                        alt={category.name}
                                                        className="w-full h-full rounded-full object-cover"
                                                    />
                                                </div>

                                                <div
                                                    className="absolute inset-0 rounded-full bg-gradient-to-br from-[#F6EFE4] via-[#EEE7F8] to-[#E7F1FB] text-slate-700 flex items-center justify-center p-2 text-center shadow-inner border border-white/70"
                                                    style={{
                                                        transform: 'rotateY(180deg)',
                                                        backfaceVisibility: 'hidden',
                                                        WebkitBackfaceVisibility: 'hidden'
                                                    }}
                                                >
                                                    <span className="text-[10px] md:text-[12px] font-bold leading-tight">
                                                        {category.name}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CategoriesPage;
