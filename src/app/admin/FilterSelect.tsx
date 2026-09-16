"use client";

/**
 * A filter dropdown inside a GET form. The design's selects filter as soon
 * as they change; a plain <select> in a server-rendered form would wait for
 * an Enter press in the search box, so this one submits the form itself.
 */
export default function FilterSelect({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: [string, string][];
}) {
  return (
    <select name={name} defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
