export default function RoleIllustration({ kind, t }) {
  const merchant = kind === "merchant";
  return <svg className={`role-illustration role-${kind}`} viewBox="0 0 128 100" role="img" aria-label={t(merchant ? "Merchant storefront illustration" : "Admin review illustration")} fill="none" xmlns="http://www.w3.org/2000/svg">
    {merchant ? <>
      <path d="M20 42 28 20h72l8 22" />
      <path d="M18 42c0 8 12 8 12 0 0 8 12 8 12 0 0 8 12 8 12 0 0 8 12 8 12 0 0 8 12 8 12 0 0 8 12 8 12 0 0 8 12 8 12 0" />
      <path d="M24 50v39h80V50M24 89h80M36 62h19v27H36zM67 62h24v16H67z" />
      <path d="M44 30v6m16-6v6m16-6v6m16-6v6" />
    </> : <>
      <circle cx="51" cy="29" r="13" />
      <path d="M25 78c2-17 12-26 26-26s24 9 26 26v7H25v-7Z" />
      <path d="m88 48 18 7v14c0 12-8 21-18 26-10-5-18-14-18-26V55l18-7Z" />
      <path d="m80 69 6 6 11-13" />
      <path d="M31 89h75" />
    </>}
  </svg>;
}
